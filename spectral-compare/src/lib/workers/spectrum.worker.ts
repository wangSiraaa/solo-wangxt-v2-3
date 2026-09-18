/// <reference lib="webworker" />
/**
 * 频谱分析 Worker：
 *  - spectrum：Welch 平均幅度谱（长录音的多帧 FFT 不阻塞主线程）
 *  - resample ：加窗 sinc 显式重采样
 *  - align    ：GCC-PHAT 互相关估计 B 相对 A 的时间偏移
 * 每个任务带 requestId，主线程可随时 cancel；计算循环内检查取消标记，
 * 且主线程会丢弃迟到的过期结果，保证不会覆盖新选区。
 */
import { computeSpectrum } from '../audio/spectrum';
import { resampleSinc } from '../audio/resample';
import { gccPhatAlign } from '../audio/align';
import type { WorkerRequest, WorkerResponse } from '../types';

const cancelled = new Set<number>();

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function isCancelled(id: number): boolean {
  return cancelled.has(id);
}

function consumeCancel(id: number): boolean {
  const had = cancelled.has(id);
  cancelled.delete(id);
  return had;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'cancel':
        cancelled.add(msg.requestId);
        break;

      case 'spectrum': {
        const result = computeSpectrum(
          msg.pcm,
          msg.sampleRate,
          msg.selection,
          msg.fftSize,
          msg.windowFn,
          msg.bandLowHz,
          msg.bandHighHz,
          () => isCancelled(msg.requestId),
          (p) => post({ type: 'progress', requestId: msg.requestId, channel: msg.channel, progress: p })
        );
        if (result === null) {
          consumeCancel(msg.requestId);
          post({ type: 'cancelled', requestId: msg.requestId });
          return;
        }
        post(
          {
            type: 'spectrum',
            requestId: msg.requestId,
            channel: msg.channel,
            freqs: result.freqs,
            magnitudesDb: result.magnitudesDb,
            bandEnergyDb: result.bandEnergyDb,
            frames: result.frames,
          },
          [result.freqs.buffer, result.magnitudesDb.buffer]
        );
        break;
      }

      case 'resample': {
        const pcm = resampleSinc(msg.pcm, msg.srcRate, msg.dstRate, (p) => {
          if (isCancelled(msg.requestId)) return false;
          post({ type: 'progress', requestId: msg.requestId, channel: null, progress: p });
          return true;
        });
        if (pcm === null) {
          consumeCancel(msg.requestId);
          post({ type: 'cancelled', requestId: msg.requestId });
          return;
        }
        post({ type: 'resample', requestId: msg.requestId, pcm }, [pcm.buffer]);
        break;
      }

      case 'align': {
        const result = gccPhatAlign(msg.a, msg.b, msg.sampleRate, msg.maxLagSec, () =>
          isCancelled(msg.requestId)
        );
        if (result === null) {
          consumeCancel(msg.requestId);
          post({ type: 'cancelled', requestId: msg.requestId });
          return;
        }
        post({ type: 'align', requestId: msg.requestId, offsetMs: result.offsetMs, confidence: result.confidence });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', requestId: 'requestId' in msg ? msg.requestId : -1, message: String(err) });
  }
};
