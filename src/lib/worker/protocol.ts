import type { WindowType } from '../types';

/** 主线程 → Worker */
export type WorkerIn =
  | {
      type: 'analyze';
      requestId: number;
      /** 选区单声道采样（已重采样到统一分析率），所有权随 transfer 转移 */
      samples: Float32Array;
      sampleRate: number;
      fftSize: number;
      window: WindowType;
    }
  | {
      type: 'xcorr';
      requestId: number;
      /** 两路单声道信号（同一采样率），用于 FFT 互相关估计时间偏移 */
      a: Float32Array;
      b: Float32Array;
      sampleRate: number;
      maxLagSec: number;
    }
  | { type: 'cancel'; requestId: number };

/** Worker → 主线程 */
export type WorkerOut =
  | { type: 'progress'; requestId: number; progress: number }
  | {
      type: 'result';
      requestId: number;
      power: Float32Array;
      sampleRate: number;
      fftSize: number;
      frames: number;
    }
  | { type: 'xcorr-result'; requestId: number; lagSec: number; confidence: number }
  | { type: 'cancelled'; requestId: number }
  | { type: 'error'; requestId: number; message: string };
