/**
 * dB 换算统一走这里：功率下限 1e-12（-120 dB），
 * 静音段得到 -120 dB，绝不产生 -Infinity / NaN。
 */
export const POWER_FLOOR = 1e-12;
export const DB_FLOOR = -120;

export function powerToDb(p: number): number {
  return 10 * Math.log10(Math.max(p, POWER_FLOOR));
}

/**
 * 频段能量：对 [fLow, fHigh] 内的 bin 功率求和。
 * power 为 worker 返回的归一化单边功率谱（Σ 全部 bin ≈ 时域均方值）。
 */
export function bandEnergy(
  power: Float32Array,
  sampleRate: number,
  fftSize: number,
  fLow: number,
  fHigh: number,
): number {
  const binHz = sampleRate / fftSize;
  const k0 = Math.max(0, Math.ceil(fLow / binHz));
  const k1 = Math.min(power.length - 1, Math.floor(fHigh / binHz));
  let e = 0;
  for (let k = k0; k <= k1; k++) e += power[k];
  return e;
}

/** 频段内峰值频率（抛物线插值，亚 bin 精度）；频段为空返回 null */
export function bandPeakFreq(
  power: Float32Array,
  sampleRate: number,
  fftSize: number,
  fLow: number,
  fHigh: number,
): number | null {
  const binHz = sampleRate / fftSize;
  const k0 = Math.max(1, Math.ceil(fLow / binHz));
  const k1 = Math.min(power.length - 2, Math.floor(fHigh / binHz));
  if (k1 < k0) return null;
  let kMax = k0;
  for (let k = k0; k <= k1; k++) if (power[k] > power[kMax]) kMax = k;
  // 抛物线插值
  const y0 = power[kMax - 1];
  const y1 = power[kMax];
  const y2 = power[kMax + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  return (kMax + Math.max(-0.5, Math.min(0.5, shift))) * binHz;
}
