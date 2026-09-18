/**
 * Worker 客户端：每个请求分配递增 requestId。
 * 取消或新选区触发新请求后，迟到的旧结果按 id 不匹配直接丢弃，
 * 绝不覆盖新选区的结果。
 */
import type { SpectrumResult } from '../types';
import type { WindowType } from '../types';
import type { WorkerIn, WorkerOut } from './protocol';

export class CancelledError extends Error {
  constructor() {
    super('analysis cancelled');
    this.name = 'CancelledError';
  }
}

interface Pending {
  resolve: (r: SpectrumResult) => void;
  reject: (e: Error) => void;
  onProgress?: (p: number) => void;
}

interface PendingXcorr {
  resolve: (r: { lagSec: number; confidence: number }) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const pendingXcorr = new Map<number, PendingXcorr>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./spectrum.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data;
      if (msg.type === 'result') {
        const p = pending.get(msg.requestId);
        if (!p) return; // 迟到/已取消：丢弃
        pending.delete(msg.requestId);
        p.resolve({
          power: msg.power,
          sampleRate: msg.sampleRate,
          fftSize: msg.fftSize,
          frames: msg.frames,
        });
      } else if (msg.type === 'progress') {
        pending.get(msg.requestId)?.onProgress?.(msg.progress);
      } else if (msg.type === 'xcorr-result') {
        const p = pendingXcorr.get(msg.requestId);
        if (!p) return;
        pendingXcorr.delete(msg.requestId);
        p.resolve({ lagSec: msg.lagSec, confidence: msg.confidence });
      } else if (msg.type === 'cancelled') {
        const p = pending.get(msg.requestId);
        if (p) {
          pending.delete(msg.requestId);
          p.reject(new CancelledError());
        }
        const px = pendingXcorr.get(msg.requestId);
        if (px) {
          pendingXcorr.delete(msg.requestId);
          px.reject(new CancelledError());
        }
      } else if (msg.type === 'error') {
        const p = pending.get(msg.requestId);
        if (p) {
          pending.delete(msg.requestId);
          p.reject(new Error(msg.message));
        }
        const px = pendingXcorr.get(msg.requestId);
        if (px) {
          pendingXcorr.delete(msg.requestId);
          px.reject(new Error(msg.message));
        }
      }
    };
  }
  return worker;
}

function post(msg: WorkerIn, transfer: Transferable[] = []): void {
  getWorker().postMessage(msg, transfer);
}

/** 取消所有在途分析（新请求会获得更大的 id，旧结果自动作废） */
export function cancelAll(): void {
  for (const [id, p] of pending) {
    post({ type: 'cancel', requestId: id });
    p.reject(new CancelledError());
  }
  pending.clear();
  for (const [id, p] of pendingXcorr) {
    post({ type: 'cancel', requestId: id });
    p.reject(new CancelledError());
  }
  pendingXcorr.clear();
}

export function analyzeSpectrum(
  samples: Float32Array,
  sampleRate: number,
  fftSize: number,
  window: WindowType,
  onProgress?: (p: number) => void,
): Promise<SpectrumResult> {
  const requestId = nextId++;
  // 复制一份再 transfer，调用方的 pcm 不受影响
  const copy = samples.slice();
  return new Promise<SpectrumResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject, onProgress });
    post(
      { type: 'analyze', requestId, samples: copy, sampleRate, fftSize, window },
      [copy.buffer],
    );
  });
}

export function estimateOffset(
  a: Float32Array,
  b: Float32Array,
  sampleRate: number,
  maxLagSec = 10,
): Promise<{ lagSec: number; confidence: number }> {
  const requestId = nextId++;
  const ca = a.slice();
  const cb = b.slice();
  return new Promise((resolve, reject) => {
    pendingXcorr.set(requestId, { resolve, reject });
    post(
      { type: 'xcorr', requestId, a: ca, b: cb, sampleRate, maxLagSec },
      [ca.buffer, cb.buffer],
    );
  });
}
