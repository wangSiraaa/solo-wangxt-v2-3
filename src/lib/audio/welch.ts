/**
 * Welch 平均功率谱累加器（纯计算，Worker 与测试共用）。
 * 归一化为单边功率：P[k] = c_k·|X[k]|² / (N·Σw²)，c_0 = 1，其余 2。
 * 全部 bin 求和 ≈ 时域均方值；幅值 A 的正弦波，其频段能量 ≈ A²/2。
 */
import FFT from 'fft.js';
import { windowCoeffs, windowPower } from './windows';
import type { WindowType } from '../types';

const fftCache = new Map<number, FFT>();

export function getFFT(size: number): FFT {
  let f = fftCache.get(size);
  if (!f) {
    f = new FFT(size);
    fftCache.set(size, f);
  }
  return f;
}

export class WelchAccumulator {
  readonly fftSize: number;
  frames = 0;
  private fft: FFT;
  private win: Float32Array;
  private s2: number;
  private input: Float32Array;
  private output: number[];
  private power: Float64Array;

  constructor(fftSize: number, windowType: WindowType) {
    this.fftSize = fftSize;
    this.fft = getFFT(fftSize);
    this.win = windowCoeffs(fftSize, windowType);
    this.s2 = windowPower(this.win);
    // realTransform 要求：输入为长度 fftSize 的纯实数数组，输出为复数数组
    this.input = new Float32Array(fftSize);
    this.output = this.fft.createComplexArray();
    this.power = new Float64Array(fftSize / 2);
  }

  /** 累加一帧（不足一帧部分补零） */
  addFrame(samples: Float32Array, offset: number): void {
    const n = this.fftSize;
    for (let i = 0; i < n; i++) {
      this.input[i] = (offset + i < samples.length ? samples[offset + i] : 0) * this.win[i];
    }
    this.fft.realTransform(this.output, this.input);
    this.fft.completeSpectrum(this.output);
    for (let k = 0; k < n / 2; k++) {
      const re = this.output[2 * k];
      const im = this.output[2 * k + 1];
      this.power[k] += re * re + im * im;
    }
    this.frames++;
  }

  /** 平均单边功率谱 */
  spectrum(): Float32Array {
    const half = this.fftSize / 2;
    const norm = this.fftSize * this.s2;
    const frames = Math.max(1, this.frames);
    const out = new Float32Array(half);
    for (let k = 0; k < half; k++) {
      const c = k === 0 ? 1 : 2;
      out[k] = (c * this.power[k]) / (frames * norm);
    }
    return out;
  }
}
