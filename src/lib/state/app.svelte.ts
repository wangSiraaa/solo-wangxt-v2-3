/**
 * 应用状态（Svelte 5 runes，模块级单例）。
 * 所有变更 → 防抖持久化到 IndexedDB + 防抖重新分析。
 */
import type {
  AnalysisPlan,
  AudioSlot,
  Marker,
  Selection,
  SlotId,
  SpectrumResult,
  WindowType,
} from '../types';
import { decodeToMono, pcmToBuffer } from '../audio/decode';
import { getAudioContext } from '../audio/player';
import { resampleLinear } from '../audio/resample';
import { analyzeSpectrum, cancelAll, CancelledError, estimateOffset } from '../worker/analyzer';
import * as db from './db';

export const app = $state({
  slots: { A: null as AudioSlot | null, B: null as AudioSlot | null },
  buffers: { A: null as AudioBuffer | null, B: null as AudioBuffer | null },
  selection: null as Selection | null,
  markers: [] as Marker[],
  window: 'hann' as WindowType,
  fftSize: 4096,
  band: { low: 200, high: 4000 },
  offsetSec: 0,
  spectrumA: null as SpectrumResult | null,
  spectrumB: null as SpectrumResult | null,
  analyzing: false,
  progress: 0,
  status: '就绪',
  restored: false,
  /** 方案里有记录但尚未重新提供音频文件时的提示 */
  pendingFiles: [] as string[],
});

let markerId = 1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let analysisTimer: ReturnType<typeof setTimeout> | null = null;
let analysisSeq = 0;

// ---------------- 持久化 ----------------

function currentPlan(): AnalysisPlan {
  return {
    version: 1,
    selection: app.selection ? { ...app.selection } : null,
    markers: app.markers.map((m) => ({ ...m })),
    window: app.window,
    fftSize: app.fftSize,
    band: { ...app.band },
    offsetSec: app.offsetSec,
    fileNames: { A: app.slots.A?.name ?? null, B: app.slots.B?.name ?? null },
    updatedAt: Date.now(),
  };
}

export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void db.savePlan(currentPlan());
  }, 300);
}

async function persistAudio(slot: SlotId): Promise<void> {
  const s = app.slots[slot];
  if (!s) return;
  await db.saveAudio(slot, {
    name: s.name,
    sampleRate: s.sampleRate,
    originalSampleRate: s.originalSampleRate,
    resampled: s.resampled,
    pcm: s.pcm,
  });
}

/** 启动时恢复：分析方案 + 本地保存的音频（刷新后标记位置可恢复） */
export async function restore(): Promise<void> {
  try {
    const [plan, audioA, audioB] = await Promise.all([
      db.loadPlan(),
      db.loadAudio('A'),
      db.loadAudio('B'),
    ]);
    const ctx = getAudioContext();
    for (const [slot, stored] of [
      ['A', audioA],
      ['B', audioB],
    ] as const) {
      if (stored) {
        app.slots[slot] = {
          name: stored.name,
          sampleRate: stored.sampleRate,
          originalSampleRate: stored.originalSampleRate,
          rawPcm: stored.pcm,
          pcm: stored.pcm,
          duration: stored.pcm.length / stored.sampleRate,
          resampled: stored.resampled,
        };
        app.buffers[slot] = pcmToBuffer(ctx, stored.pcm, stored.sampleRate);
      }
    }
    if (plan) {
      app.selection = plan.selection;
      app.markers = plan.markers;
      markerId = plan.markers.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      app.window = plan.window;
      app.fftSize = plan.fftSize;
      app.band = plan.band;
      app.offsetSec = plan.offsetSec;
      // 方案记录了文件名但本地没有音频 → 提示用户重新选择
      const missing: string[] = [];
      if (plan.fileNames.A && !audioA) missing.push(`A: ${plan.fileNames.A}`);
      if (plan.fileNames.B && !audioB) missing.push(`B: ${plan.fileNames.B}`);
      app.pendingFiles = missing;
    }
    app.status = app.restored ? app.status : '已恢复本地方案';
  } catch (e) {
    console.error('restore failed', e);
    app.status = '本地恢复失败（不影响新分析）';
  } finally {
    app.restored = true;
    scheduleAnalysis();
  }
}

// ---------------- 音频载入 ----------------

function referenceRate(): number | null {
  return app.slots.A?.sampleRate ?? app.slots.B?.sampleRate ?? null;
}

/** 若与参考采样率不同则显式重采样（线性插值），并更新提示 */
function conformToReference(slot: AudioSlot): AudioSlot {
  const ref = referenceRate();
  if (ref && slot.originalSampleRate !== ref) {
    const pcm = resampleLinear(slot.rawPcm, slot.originalSampleRate, ref);
    return {
      ...slot,
      pcm,
      sampleRate: ref,
      duration: pcm.length / ref,
      resampled: true,
    };
  }
  return {
    ...slot,
    pcm: slot.rawPcm,
    sampleRate: slot.originalSampleRate,
    duration: slot.rawPcm.length / slot.originalSampleRate,
    resampled: false,
  };
}

export async function loadFile(slot: SlotId, file: File): Promise<void> {
  app.status = `解码 ${file.name} …`;
  const data = await file.arrayBuffer();
  const { pcm, sampleRate, buffer } = await decodeToMono(data);
  const raw: AudioSlot = {
    name: file.name,
    originalSampleRate: sampleRate,
    rawPcm: pcm,
    pcm,
    sampleRate,
    duration: pcm.length / sampleRate,
    resampled: false,
  };
  app.slots[slot] = raw;
  // 参考率以 A 为准；若载入的是 A 且 B 已存在且速率不同 → B 需要重新重采样
  if (slot === 'A' && app.slots.B) app.slots.B = conformToReference(app.slots.B);
  app.slots[slot] = conformToReference(raw);
  app.buffers[slot] = buffer;
  app.pendingFiles = app.pendingFiles.filter((n) => !n.endsWith(file.name));
  if (!app.selection) {
    app.selection = { start: 0, end: Math.min(5, app.slots[slot]!.duration) };
  }
  app.status = '就绪';
  await persistAudio(slot);
  schedulePersist();
  scheduleAnalysis();
}

export async function loadSample(slot: SlotId, url: string, name: string): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  await loadFile(slot, new File([blob], name));
}

export function clearSlot(slot: SlotId): void {
  app.slots[slot] = null;
  app.buffers[slot] = null;
  void db.deleteAudio(slot);
  schedulePersist();
  scheduleAnalysis();
}

// ---------------- 选区 / 标记 / 参数 ----------------

export function setSelection(sel: Selection | null): void {
  app.selection = sel;
  schedulePersist();
  scheduleAnalysis();
}

export function addMarker(time: number): void {
  const label = `M${markerId}`;
  app.markers = [...app.markers, { id: markerId++, time, label }].sort((a, b) => a.time - b.time);
  schedulePersist();
}

export function removeMarker(id: number): void {
  app.markers = app.markers.filter((m) => m.id !== id);
  schedulePersist();
}

export function setWindow(w: WindowType): void {
  app.window = w;
  schedulePersist();
  scheduleAnalysis();
}

export function setFftSize(n: number): void {
  app.fftSize = n;
  schedulePersist();
  scheduleAnalysis();
}

export function setBand(low: number, high: number): void {
  app.band = { low: Math.max(0, low), high: Math.max(low, high) };
  schedulePersist();
  scheduleAnalysis();
}

export function setOffset(sec: number): void {
  app.offsetSec = sec;
  schedulePersist();
  scheduleAnalysis();
}

// ---------------- 分析 ----------------

export function scheduleAnalysis(): void {
  if (analysisTimer) clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => void runAnalysis(), 150);
}

export function cancelAnalysis(): void {
  analysisSeq++;
  cancelAll();
  app.analyzing = false;
  app.status = '已取消';
}

export async function runAnalysis(): Promise<void> {
  const sel = app.selection;
  const A = app.slots.A;
  const B = app.slots.B;
  cancelAll();
  if (!sel || sel.end <= sel.start || (!A && !B)) {
    app.spectrumA = null;
    app.spectrumB = null;
    app.analyzing = false;
    return;
  }
  const seq = ++analysisSeq;
  app.analyzing = true;
  app.progress = 0;
  app.status = '分析中…';
  const prog = { A: 0, B: 0 };
  const updateProg = () => {
    const n = (A ? 1 : 0) + (B ? 1 : 0);
    app.progress = (prog.A + prog.B) / Math.max(1, n);
  };

  const jobs: Promise<void>[] = [];
  const run = (
    slot: AudioSlot,
    t0: number,
    t1: number,
    key: 'A' | 'B',
  ): Promise<void> | null => {
    const fs = slot.sampleRate;
    const i0 = Math.max(0, Math.floor(t0 * fs));
    const i1 = Math.min(slot.pcm.length, Math.ceil(t1 * fs));
    if (i1 - i0 < 16) return null;
    return analyzeSpectrum(slot.pcm.subarray(i0, i1), fs, app.fftSize, app.window, (p) => {
      prog[key] = p;
      updateProg();
    })
      .then((r) => {
        if (seq !== analysisSeq) return; // 已有更新的请求，丢弃
        if (key === 'A') app.spectrumA = r;
        else app.spectrumB = r;
      })
      .catch((e: unknown) => {
        if (e instanceof CancelledError) return;
        if (seq === analysisSeq) {
          app.status = `分析出错: ${e instanceof Error ? e.message : String(e)}`;
        }
      });
  };

  if (A) {
    const j = run(A, sel.start, sel.end, 'A');
    if (j) jobs.push(j);
    else app.spectrumA = null;
  }
  if (B) {
    // B 的对应段落按校准偏移平移
    const j = run(B, sel.start + app.offsetSec, sel.end + app.offsetSec, 'B');
    if (j) jobs.push(j);
    else app.spectrumB = null;
  }
  await Promise.all(jobs);
  if (seq === analysisSeq) {
    app.analyzing = false;
    app.progress = 1;
    app.status = '就绪';
  }
}

/** 自动估计 B 相对 A 的时间偏移（FFT 互相关，在 Worker 中执行） */
export async function autoOffset(): Promise<void> {
  const A = app.slots.A;
  const B = app.slots.B;
  if (!A || !B) {
    app.status = '需要先载入 A 和 B';
    return;
  }
  app.status = '估计偏移中…';
  try {
    const { lagSec, confidence } = await estimateOffset(A.pcm, B.pcm, A.sampleRate);
    app.offsetSec = Math.round(lagSec * 1000) / 1000;
    app.status = `偏移 ≈ ${app.offsetSec.toFixed(3)} s（相关强度 ${confidence.toFixed(1)}）`;
    schedulePersist();
    scheduleAnalysis();
  } catch (e) {
    if (!(e instanceof CancelledError)) app.status = '偏移估计失败';
  }
}
