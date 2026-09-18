import FFT from 'fft.js';

/**
 * GCC-PHAT 广义互相关时延估计。
 * 返回 B 相对 A 的偏移（毫秒）：正值表示 B 的内容比 A 晚出现。
 * 超长录音只取中段最多 2^20 个采样，控制内存与耗时。
 */
export function gccPhatAlign(
  a: Float32Array,
  b: Float32Array,
  sampleRate: number,
  maxLagSec: number,
  shouldCancel: () => boolean = () => false
): { offsetMs: number; confidence: number } | null {
  const cap = 1 << 20;
  const segA = a.length > cap ? a.subarray((a.length - cap) >> 1, ((a.length - cap) >> 1) + cap) : a;
  const segB = b.length > cap ? b.subarray((b.length - cap) >> 1, ((b.length - cap) >> 1) + cap) : b;

  let n = 1;
  while (n < segA.length + segB.length) n <<= 1;
  const fft = new FFT(n);
  const fa = fft.createComplexArray();
  const fb = fft.createComplexArray();
  const ta = fft.createComplexArray();
  const tb = fft.createComplexArray();

  for (let i = 0; i < segA.length; i++) ta[2 * i] = segA[i];
  for (let i = 0; i < segB.length; i++) tb[2 * i] = segB[i];
  fft.transform(fa, ta);
  fft.transform(fb, tb);
  if (shouldCancel()) return null;

  // 互功率谱 + PHAT 白化
  const cross = fft.createComplexArray();
  for (let i = 0; i < n; i++) {
    const ar = fa[2 * i], ai = fa[2 * i + 1];
    const br = fb[2 * i], bi = fb[2 * i + 1];
    const re = ar * br + ai * bi; // conj(A) * B
    const im = ai * br - ar * bi;
    const mag = Math.sqrt(re * re + im * im) + 1e-12;
    cross[2 * i] = re / mag;
    cross[2 * i + 1] = im / mag;
  }
  const corr = fft.createComplexArray();
  fft.inverseTransform(corr, cross);

  const maxLag = Math.min(Math.round(maxLagSec * sampleRate), n >> 1);
  let bestLag = 0;
  let bestVal = -Infinity;
  let peak2 = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const idx = ((lag % n) + n) % n;
    const v = corr[2 * idx];
    if (v > bestVal) {
      peak2 = bestVal;
      bestVal = v;
      bestLag = lag;
    } else if (v > peak2) {
      peak2 = v;
    }
  }
  // fft.js 的 IFFT(conj(A)·B) 在 B 延迟 D 个采样时峰值出现在 lag = -D，
  // 因此取相反数：offsetMs > 0 表示 B 的内容比 A 晚出现
  const offsetMs = (-bestLag / sampleRate) * 1000;
  const confidence = peak2 > 0 ? Math.min(1, Math.max(0, 1 - peak2 / (bestVal + 1e-12))) : 1;
  return { offsetMs, confidence };
}
