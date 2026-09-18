/** 窗函数类型 */
export type WindowType = 'hann' | 'hamming' | 'blackman' | 'rectangular';

/** 时间选区（秒），波形与频谱共享 */
export interface TimeSelection {
  startSec: number;
  endSec: number;
}

/** 已加载的音频（单声道 PCM，常驻内存，不离开本地） */
export interface AudioData {
  name: string;
  pcm: Float32Array;
  sampleRate: number;
  duration: number;
  /** 若发生过显式重采样，记录原始采样率 */
  resampledFrom?: number;
}

/** 分析方案 —— 持久化到 IndexedDB 的最小单元 */
export interface AnalysisPlan {
  id: string;
  name: string;
  fileAName: string | null;
  fileBName: string | null;
  selection: TimeSelection | null;
  windowFn: WindowType;
  fftSize: number;
  bandLowHz: number;
  bandHighHz: number;
  /** B 相对 A 的时间偏移（毫秒），正值表示 B 的内容出现得更晚 */
  offsetMs: number;
  updatedAt: number;
}

/** 单通道频谱分析结果 */
export interface SpectrumResult {
  channel: 'A' | 'B';
  freqs: Float32Array;
  magnitudesDb: Float32Array;
  sampleRate: number;
  fftSize: number;
  windowFn: WindowType;
  selection: TimeSelection;
  bandLowHz: number;
  bandHighHz: number;
  bandEnergyDb: number;
  frames: number;
}

/* ---------- Worker 消息协议 ---------- */

export type WorkerRequest =
  | {
      type: 'spectrum';
      requestId: number;
      channel: 'A' | 'B';
      pcm: Float32Array;
      sampleRate: number;
      selection: TimeSelection;
      fftSize: number;
      windowFn: WindowType;
      bandLowHz: number;
      bandHighHz: number;
    }
  | {
      type: 'resample';
      requestId: number;
      pcm: Float32Array;
      srcRate: number;
      dstRate: number;
    }
  | {
      type: 'align';
      requestId: number;
      a: Float32Array;
      b: Float32Array;
      sampleRate: number;
      maxLagSec: number;
    }
  | { type: 'cancel'; requestId: number };

export type WorkerResponse =
  | {
      type: 'spectrum';
      requestId: number;
      channel: 'A' | 'B';
      freqs: Float32Array;
      magnitudesDb: Float32Array;
      bandEnergyDb: number;
      frames: number;
    }
  | { type: 'resample'; requestId: number; pcm: Float32Array }
  | { type: 'align'; requestId: number; offsetMs: number; confidence: number }
  | { type: 'progress'; requestId: number; channel: 'A' | 'B' | null; progress: number }
  | { type: 'cancelled'; requestId: number }
  | { type: 'error'; requestId: number; message: string };
