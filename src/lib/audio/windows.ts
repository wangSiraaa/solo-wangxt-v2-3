import type { WindowType } from '../types';

/** 生成窗函数系数 */
export function windowCoeffs(size: number, type: WindowType): Float32Array {
  const w = new Float32Array(size);
  const N = size - 1;
  for (let n = 0; n < size; n++) {
    switch (type) {
      case 'hann':
        w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
        break;
      case 'hamming':
        w[n] = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / N);
        break;
      case 'blackman':
        w[n] =
          0.42 - 0.5 * Math.cos((2 * Math.PI * n) / N) + 0.08 * Math.cos((4 * Math.PI * n) / N);
        break;
      case 'rect':
        w[n] = 1;
        break;
    }
  }
  return w;
}

/** Σ w²，用于功率谱归一化（使正弦波频段能量 = A²/2） */
export function windowPower(w: Float32Array): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * w[i];
  return s;
}
