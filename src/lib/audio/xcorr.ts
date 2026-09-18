/**
 * FFT 互相关估计时间偏移（纯计算，Worker 与测试共用）。
 * B(t) ≈ A(t−d) 时返回 d（秒，正值表示 B 落后于 A）。
 */
import { getFFT } from './welch';

export function estimateLag(
  a: Float32Array,
  b: Float32Array,
  sampleRate: number,
  maxLagSec: number,
): { lagSec: number; confidence: number } {
  // 降采样到 ≤8 kHz 加速（盒式平均粗略抗混叠，对对齐足够）
  const factor = Math.max(1, Math.floor(sampleRate / 8000));
  const ds = (x: Float32Array) => {
    const n = Math.floor(x.length / factor);
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * factor;
      for (let j = 0; j < factor; j++) s += x[base + j];
      o[i] = s / factor;
    }
    return o;
  };
  const da = ds(a);
  const db = ds(b);
  const fs = sampleRate / factor;

  let size = 1;
  while (size < da.length + db.length) size <<= 1;
  const fft = getFFT(size);
  const fa = fft.createComplexArray();
  const fb = fft.createComplexArray();
  for (let i = 0; i < size; i++) {
    fa[2 * i] = i < da.length ? da[i] : 0;
    fa[2 * i + 1] = 0;
    fb[2 * i] = i < db.length ? db[i] : 0;
    fb[2 * i + 1] = 0;
  }
  const oa = fft.createComplexArray();
  const ob = fft.createComplexArray();
  fft.transform(oa, fa);
  fft.transform(ob, fb);
  // R(τ) = IFFT(conj(Â)·B̂)，峰值位于 τ = d
  const prod = fft.createComplexArray();
  for (let i = 0; i < size; i++) {
    const ar = oa[2 * i];
    const ai = oa[2 * i + 1];
    const br = ob[2 * i];
    const bi = ob[2 * i + 1];
    prod[2 * i] = ar * br + ai * bi;
    prod[2 * i + 1] = ar * bi - ai * br;
  }
  const corrC = fft.createComplexArray();
  fft.inverseTransform(corrC, prod);
  const corr = new Float64Array(size);
  for (let i = 0; i < size; i++) corr[i] = corrC[2 * i] / size;

  const maxLag = Math.min(Math.floor(maxLagSec * fs), Math.floor(size / 2) - 1);
  let bestLag = 0;
  let bestVal = -Infinity;
  let sumSq = 0;
  let count = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const idx = ((lag % size) + size) % size;
    const v = corr[idx];
    sumSq += v * v;
    count++;
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, count));
  return { lagSec: bestLag / fs, confidence: rms > 0 ? bestVal / rms : 0 };
}
