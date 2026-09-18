import FFT from 'fft.js';
import { applyWindowInPlace, windowPowerCorrection } from './windows';
import { powerToDb, bandPowerToDb } from './dsp';
import type { TimeSelection, WindowType } from '../types';

export interface SpectrumOutput {
  freqs: Float32Array;
  magnitudesDb: Float32Array;
  bandEnergyDb: number;
  frames: number;
}

/**
 * Welch 平均幅度谱：选区内按 fftSize 分帧、50% 重叠、加窗后逐帧 FFT，
 * 功率谱跨帧平均。幅值按 (N · 相干增益) 归一化，
 * 使幅值 A 的正弦在谱上读数约为 20·log10(A)。
 * 静音段功率为 0 时由 powerToDb 截断到 -120 dB，不会产生 -Infinity。
 *
 * shouldCancel 返回 true 时中止并返回 null（供 Worker 响应取消）。
 */
export function computeSpectrum(
  pcm: Float32Array,
  sampleRate: number,
  selection: TimeSelection,
  fftSize: number,
  windowFn: WindowType,
  bandLowHz: number,
  bandHighHz: number,
  shouldCancel: () => boolean = () => false,
  onProgress: (p: number) => void = () => {}
): SpectrumOutput | null {
  const fft = new FFT(fftSize);
  const half = fftSize >> 1;
  const out = fft.createComplexArray();
  const frame = new Float32Array(fftSize);

  const start = Math.max(0, Math.floor(selection.startSec * sampleRate));
  let end = Math.min(pcm.length, Math.ceil(selection.endSec * sampleRate));
  if (end - start < 16) end = Math.min(pcm.length, start + 16);

  const hop = fftSize >> 1;
  const totalFrames = Math.max(1, Math.floor((end - start - fftSize) / hop) + 1);
  const acc = new Float64Array(half + 1);
  let framesDone = 0;
  let lastProgress = 0;

  for (let f = 0; f < totalFrames; f++) {
    if ((f & 31) === 0 && shouldCancel()) return null;
    const offset = start + f * hop;
    frame.fill(0);
    const avail = Math.min(fftSize, end - offset);
    frame.set(pcm.subarray(offset, offset + avail));
    const { cg } = applyWindowInPlace(windowFn, frame);
    // fft.js 的 realTransform 直接接受长度为 N 的实数数组
    fft.realTransform(out, frame as unknown as number[]);
    // 单边幅值谱归一化：幅值 A 的正弦峰值读数为 A
    const norm = (fftSize * Math.max(cg, 1e-9)) / 2;
    for (let k = 0; k <= half; k++) {
      const re = out[2 * k];
      const im = out[2 * k + 1];
      let p = (re * re + im * im) / (norm * norm);
      if (k === 0 || k === half) p /= 4; // DC 与奈奎斯特不翻倍
      acc[k] += p;
    }
    framesDone++;
    if (f - lastProgress >= 32) {
      lastProgress = f;
      onProgress(f / totalFrames);
    }
  }

  const freqs = new Float32Array(half + 1);
  const mags = new Float32Array(half + 1);
  const binHz = sampleRate / fftSize;
  for (let k = 0; k <= half; k++) {
    freqs[k] = k * binHz;
    mags[k] = powerToDb(acc[k] / framesDone);
  }

  // 指定频段能量（功率和 × 窗能量修正 cg²/eg，静音时截断到 -120 dB）
  const kLo = Math.max(0, Math.ceil(bandLowHz / binHz));
  const kHi = Math.min(half, Math.floor(bandHighHz / binHz));
  const pc = windowPowerCorrection(windowFn, fftSize);
  let bandPower = 0;
  for (let k = kLo; k <= kHi; k++) bandPower += acc[k] / framesDone;
  bandPower *= pc;

  return {
    freqs,
    magnitudesDb: mags,
    bandEnergyDb: bandPowerToDb(bandPower),
    frames: framesDone,
  };
}
