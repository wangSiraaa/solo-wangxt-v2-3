import type { WindowType } from '../types';

export const WINDOW_LABELS: Record<WindowType, string> = {
  hann: 'Hann',
  hamming: 'Hamming',
  blackman: 'Blackman',
  rectangular: 'Rectangular',
};

export function windowValue(type: WindowType, i: number, n: number): number {
  if (n <= 1) return 1;
  const x = (2 * Math.PI * i) / (n - 1);
  switch (type) {
    case 'rectangular':
      return 1;
    case 'hann':
      return 0.5 * (1 - Math.cos(x));
    case 'hamming':
      return 0.54 - 0.46 * Math.cos(x);
    case 'blackman':
      return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
}

/** 窗能量修正因子 cg²/eg：频段能量求和时乘以此值，使单音能量读数为 A² */
export function windowPowerCorrection(type: WindowType, n: number): number {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const w = windowValue(type, i, n);
    sum += w;
    sumSq += w * w;
  }
  const cg = n > 0 ? sum / n : 1;
  const eg = n > 0 ? sumSq / n : 1;
  return (cg * cg) / Math.max(eg, 1e-12);
}

/** 就地加窗，返回相干增益 cg 与能量增益 eg（用于幅值/功率归一化） */
export function applyWindowInPlace(type: WindowType, data: Float32Array): { cg: number; eg: number } {
  const n = data.length;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const w = windowValue(type, i, n);
    data[i] *= w;
    sum += w;
    sumSq += w * w;
  }
  return {
    cg: n > 0 ? sum / n : 1,
    eg: n > 0 ? sumSq / n : 1,
  };
}
