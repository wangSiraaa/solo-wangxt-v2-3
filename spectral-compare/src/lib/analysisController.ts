import { get } from 'svelte/store';
import {
  fileA, fileB, selection, windowFn, fftSize,
  bandLowHz, bandHighHz, offsetMs, spectra, progress,
} from './stores';
import { powerToDb } from './audio/dsp';
import { windowPowerCorrection } from './audio/windows';
import type { AudioData, SpectrumResult, TimeSelection, WorkerResponse } from './types';

/**
 * 分析控制器：
 *  - 所有 FFT / 重采样 / 对齐计算都在 Web Worker 中执行
 *  - 每个请求有递增 requestId；只有“最新且有效”的请求结果会被采纳
 *  - 取消后清空有效 id 集合，迟到的结果一律丢弃，绝不覆盖新选区
 */

let worker: Worker | null = null;
let nextId = 1;
const validIds = new Set<number>();
const inFlight = new Set<number>();
const latestByChannel: Record<'A' | 'B', number> = { A: 0, B: 0 };
const resampleWaiters = new Map<number, { resolve: (pcm: Float32Array) => void; reject: (e: Error) => void }>();
const alignWaiters = new Map<number, { resolve: (r: { offsetMs: number; confidence: number }) => void; reject: (e: Error) => void }>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./workers/spectrum.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => handleMessage(e.data);
  }
  return worker;
}

function handleMessage(msg: WorkerResponse) {
  if (msg.type === 'progress') {
    if (!validIds.has(msg.requestId)) return;
    if (msg.channel) progress.update((p) => ({ ...p, [msg.channel as 'A' | 'B']: msg.progress }));
    return;
  }
  inFlight.delete(msg.requestId);
  if (!validIds.has(msg.requestId)) return; // 已取消或已被取代：丢弃迟到结果
  validIds.delete(msg.requestId);

  switch (msg.type) {
    case 'spectrum': {
      if (msg.requestId !== latestByChannel[msg.channel]) return; // 被更新的请求取代
      const ch = msg.channel;
      const sel = get(selection);
      const result: SpectrumResult = {
        channel: ch,
        freqs: msg.freqs,
        magnitudesDb: msg.magnitudesDb,
        sampleRate: msg.freqs.length > 1 ? (msg.freqs[msg.freqs.length - 1] * 2) : 0,
        fftSize: (msg.freqs.length - 1) * 2,
        windowFn: get(windowFn),
        selection: sel ?? { startSec: 0, endSec: 0 },
        bandLowHz: get(bandLowHz),
        bandHighHz: get(bandHighHz),
        bandEnergyDb: msg.bandEnergyDb,
        frames: msg.frames,
      };
      spectra.update((s) => ({ ...s, [ch]: result }));
      progress.update((p) => ({ ...p, [ch]: null }));
      break;
    }
    case 'resample': {
      const w = resampleWaiters.get(msg.requestId);
      resampleWaiters.delete(msg.requestId);
      w?.resolve(msg.pcm);
      break;
    }
    case 'align': {
      const w = alignWaiters.get(msg.requestId);
      alignWaiters.delete(msg.requestId);
      w?.resolve({ offsetMs: msg.offsetMs, confidence: msg.confidence });
      break;
    }
    case 'cancelled':
      break;
    case 'error': {
      console.error('[analysis worker]', msg.message);
      const rw = resampleWaiters.get(msg.requestId);
      if (rw) { resampleWaiters.delete(msg.requestId); rw.reject(new Error(msg.message)); }
      const aw = alignWaiters.get(msg.requestId);
      if (aw) { alignWaiters.delete(msg.requestId); aw.reject(new Error(msg.message)); }
      progress.set({ A: null, B: null });
      break;
    }
  }
}

/** 取消全部分析：失效所有在途请求，迟到的结果会被直接丢弃 */
export function cancelAnalysis(): void {
  validIds.clear();
  for (const id of inFlight) worker?.postMessage({ type: 'cancel', requestId: id });
  inFlight.clear();
  spectra.set({ A: null, B: null });
  progress.set({ A: null, B: null });
}

function requestSpectrum(channel: 'A' | 'B', audio: AudioData, sel: TimeSelection): void {
  const id = nextId++;
  validIds.add(id);
  inFlight.add(id);
  latestByChannel[channel] = id;
  const pcmCopy = audio.pcm.slice(); // transfer 会 detach，必须复制
  ensureWorker().postMessage(
    {
      type: 'spectrum',
      requestId: id,
      channel,
      pcm: pcmCopy,
      sampleRate: audio.sampleRate,
      selection: sel,
      fftSize: get(fftSize),
      windowFn: get(windowFn),
      bandLowHz: get(bandLowHz),
      bandHighHz: get(bandHighHz),
    },
    [pcmCopy.buffer]
  );
  progress.update((p) => ({ ...p, [channel]: 0 }));
}

/** B 的选区按偏移平移并裁剪到自身时长内 */
function shiftedSelection(sel: TimeSelection, offsetMsVal: number, duration: number): TimeSelection | null {
  const dt = offsetMsVal / 1000;
  let startSec = sel.startSec + dt;
  let endSec = sel.endSec + dt;
  startSec = Math.max(0, Math.min(duration, startSec));
  endSec = Math.max(0, Math.min(duration, endSec));
  if (endSec - startSec < 0.001) return null;
  return { startSec, endSec };
}

export function runAnalysisNow(): void {
  const sel = get(selection);
  const a = get(fileA);
  const b = get(fileB);
  if (!sel) return;
  if (a) requestSpectrum('A', a, sel);
  if (b) {
    const shifted = shiftedSelection(sel, get(offsetMs), b.duration);
    if (shifted) requestSpectrum('B', b, shifted);
  }
}

/** 参数变化后防抖触发重分析 */
export function scheduleAnalysis(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runAnalysisNow, 250);
}

/** 频段变化不需要重算 FFT：从已有频谱的功率谱直接积分（含窗能量修正） */
export function recomputeBandEnergies(): void {
  const low = get(bandLowHz);
  const high = get(bandHighHz);
  spectra.update((s) => {
    const next = { ...s };
    for (const ch of ['A', 'B'] as const) {
      const r = next[ch];
      if (!r) continue;
      const pc = windowPowerCorrection(r.windowFn, r.fftSize);
      let power = 0;
      for (let k = 0; k < r.freqs.length; k++) {
        if (r.freqs[k] >= low && r.freqs[k] <= high) power += 10 ** (r.magnitudesDb[k] / 10);
      }
      next[ch] = { ...r, bandLowHz: low, bandHighHz: high, bandEnergyDb: powerToDb(power * pc) };
    }
    return next;
  });
}

/** 显式重采样（采样率不一致时调用），在 Worker 中执行 */
export function requestResample(pcm: Float32Array, srcRate: number, dstRate: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    validIds.add(id);
    inFlight.add(id);
    resampleWaiters.set(id, { resolve, reject });
    const copy = pcm.slice();
    ensureWorker().postMessage(
      { type: 'resample', requestId: id, pcm: copy, srcRate, dstRate },
      [copy.buffer]
    );
  });
}

/** GCC-PHAT 自动对齐，返回 B 相对 A 的偏移（毫秒） */
export function requestAlign(a: Float32Array, b: Float32Array, sampleRate: number, maxLagSec = 2): Promise<{ offsetMs: number; confidence: number }> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    validIds.add(id);
    inFlight.add(id);
    alignWaiters.set(id, { resolve, reject });
    const ca = a.slice();
    const cb = b.slice();
    ensureWorker().postMessage(
      { type: 'align', requestId: id, a: ca, b: cb, sampleRate, maxLagSec },
      [ca.buffer, cb.buffer]
    );
  });
}

/** 订阅相关 store：参数变化自动重分析；频段变化本地重积分 */
export function initAnalysisController(): () => void {
  ensureWorker();
  const unsubs = [
    fileA.subscribe(scheduleAnalysis),
    fileB.subscribe(scheduleAnalysis),
    selection.subscribe(scheduleAnalysis),
    windowFn.subscribe(scheduleAnalysis),
    fftSize.subscribe(scheduleAnalysis),
    offsetMs.subscribe(scheduleAnalysis),
    bandLowHz.subscribe(recomputeBandEnergies),
    bandHighHz.subscribe(recomputeBandEnergies),
  ];
  return () => {
    for (const u of unsubs) u();
    if (debounceTimer) clearTimeout(debounceTimer);
    worker?.terminate();
    worker = null;
  };
}
