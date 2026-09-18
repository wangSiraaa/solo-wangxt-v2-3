import { writable } from 'svelte/store';
import type { AudioData, SpectrumResult, TimeSelection, WindowType } from './types';

/** 两段录音（原始数据只存在于本地内存） */
export const fileA = writable<AudioData | null>(null);
export const fileB = writable<AudioData | null>(null);

/** 波形与频谱共享的时间选区 */
export const selection = writable<TimeSelection | null>(null);

/** 分析参数 */
export const windowFn = writable<WindowType>('hann');
export const fftSize = writable(4096);
export const bandLowHz = writable(200);
export const bandHighHz = writable(2000);

/** B 相对 A 的时间偏移（毫秒） */
export const offsetMs = writable(0);

/** 频谱结果 */
export const spectra = writable<{ A: SpectrumResult | null; B: SpectrumResult | null }>({
  A: null,
  B: null,
});

/** 每通道分析进度 0..1，null 表示空闲 */
export const progress = writable<{ A: number | null; B: number | null }>({ A: null, B: null });

/** 重采样提示（如 “B: 48000 Hz → 44100 Hz”） */
export const resampleNotice = writable<string | null>(null);

/** 当前方案元信息 */
export const planId = writable<string>('');
export const planName = writable<string>('未命名方案');
