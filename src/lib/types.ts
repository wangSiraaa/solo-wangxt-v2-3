export type SlotId = 'A' | 'B';

export type WindowType = 'hann' | 'hamming' | 'blackman' | 'rect';

export const FFT_SIZES = [1024, 2048, 4096, 8192, 16384] as const;

/** 解码并（必要时）重采样后的单声道音频，只存在于本地内存 / IndexedDB */
export interface AudioSlot {
  name: string;
  /** 分析用采样率（若与原始不同则已显式重采样） */
  sampleRate: number;
  /** 原始文件采样率 */
  originalSampleRate: number;
  /** 原始采样率下的单声道 PCM（参考率变化时用于重新重采样） */
  rawPcm: Float32Array;
  /** 分析用单声道 PCM（sampleRate 上） */
  pcm: Float32Array;
  duration: number;
  resampled: boolean;
}

export interface Selection {
  /** 秒，参考时间轴（A 的时间轴） */
  start: number;
  end: number;
}

export interface Marker {
  id: number;
  /** 秒，参考时间轴 */
  time: number;
  label: string;
}

/** 频谱分析结果：每个 bin 的归一化单边功率（全频段求和 ≈ 时域均方值） */
export interface SpectrumResult {
  power: Float32Array;
  sampleRate: number;
  fftSize: number;
  frames: number;
}

/** 写入 IndexedDB 的分析方案（不含服务端，纯本地） */
export interface AnalysisPlan {
  version: 1;
  selection: Selection | null;
  markers: Marker[];
  window: WindowType;
  fftSize: number;
  band: { low: number; high: number };
  /** B 相对 A 的时间偏移：B 中对应 A 选区 [t0,t1] 的段落为 [t0+offset, t1+offset] */
  offsetSec: number;
  fileNames: { A: string | null; B: string | null };
  updatedAt: number;
}

export interface BandComparison {
  /** 频段能量 dB（已做 -120 dB 地板，绝不出现 -Infinity） */
  energyA: number;
  energyB: number;
  /** A - B，dB */
  delta: number;
  peakFreqA: number | null;
  peakFreqB: number | null;
}
