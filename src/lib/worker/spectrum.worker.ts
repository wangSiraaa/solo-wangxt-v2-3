/**
 * 频谱分析 Worker：fft.js 计算 Welch 平均功率谱 + FFT 互相关偏移估计。
 * 长录音分块处理并周期性让出事件循环，使 cancel 消息能及时生效；
 * 已取消的请求立即丢弃，结果不会发回主线程。
 */
import { WelchAccumulator } from '../audio/welch';
import { estimateLag } from '../audio/xcorr';
import type { WorkerIn, WorkerOut } from './protocol';

// 避免在全局 tsconfig 中混用 DOM 与 WebWorker lib，本地声明最小接口
interface WorkerScope {
  postMessage(msg: WorkerOut, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
}
const ctx = self as unknown as WorkerScope;

const cancelled = new Set<number>();
const yieldLoop = () => new Promise<void>((r) => setTimeout(r, 0));

async function analyze(msg: Extract<WorkerIn, { type: 'analyze' }>): Promise<void> {
  const { requestId, samples, sampleRate, fftSize, window } = msg;
  const acc = new WelchAccumulator(fftSize, window);
  const hop = fftSize >> 1; // 50% 重叠
  const nFrames = Math.max(1, Math.floor((samples.length - fftSize) / hop) + 1);
  const CHUNK = 32;

  for (let f = 0; f < nFrames; f++) {
    if (cancelled.has(requestId)) {
      cancelled.delete(requestId);
      ctx.postMessage({ type: 'cancelled', requestId });
      return;
    }
    acc.addFrame(samples, f * hop);
    if (f % CHUNK === CHUNK - 1) {
      ctx.postMessage({ type: 'progress', requestId, progress: (f + 1) / nFrames });
      await yieldLoop();
    }
  }

  const power = acc.spectrum();
  ctx.postMessage(
    { type: 'result', requestId, power, sampleRate, fftSize, frames: acc.frames },
    [power.buffer],
  );
}

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled.add(msg.requestId);
    return;
  }
  const run = (async () => {
    if (msg.type === 'analyze') {
      await analyze(msg);
    } else {
      if (cancelled.has(msg.requestId)) {
        cancelled.delete(msg.requestId);
        ctx.postMessage({ type: 'cancelled', requestId: msg.requestId });
        return;
      }
      const { lagSec, confidence } = estimateLag(msg.a, msg.b, msg.sampleRate, msg.maxLagSec);
      ctx.postMessage({ type: 'xcorr-result', requestId: msg.requestId, lagSec, confidence });
    }
  })();
  run.catch((err) => {
    ctx.postMessage({
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
