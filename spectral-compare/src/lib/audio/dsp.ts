/**
 * 分贝换算。静音段功率为 0，直接 log10 会得到 -Infinity，
 * 这里统一用功率下限 1e-12（对应 -120 dB）截断，保证界面上永不出现无限大。
 */
export const DB_FLOOR = -120;
export const POWER_FLOOR = 1e-12;
export const AMP_FLOOR = 1e-6;

export function powerToDb(power: number): number {
  return Math.max(DB_FLOOR, 10 * Math.log10(Math.max(power, POWER_FLOOR)));
}

export function amplitudeToDb(amp: number): number {
  return Math.max(DB_FLOOR, 20 * Math.log10(Math.max(amp, AMP_FLOOR)));
}

/** 频段能量（功率和）→ dB，带静音下限 */
export function bandPowerToDb(powerSum: number): number {
  return powerToDb(powerSum);
}
