/**
 * 加窗 sinc 重采样（带抗混叠低通）。
 * 在 Web Worker 中执行；用于两段录音采样率不一致时的显式重采样。
 */
export function resampleSinc(
  input: Float32Array,
  srcRate: number,
  dstRate: number,
  onProgress?: (p: number) => boolean // 返回 false 表示取消
): Float32Array | null {
  if (srcRate === dstRate) return input.slice();
  const ratio = dstRate / srcRate;
  const outLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLen);
  const taps = 16; // 每侧抽头数
  // 归一化截止频率：降采样时按目标奈奎斯特压缩，留 5% 过渡带
  const cutoff = Math.min(1, ratio) * 0.95;

  const progressStep = Math.max(1, Math.floor(outLen / 50));
  for (let i = 0; i < outLen; i++) {
    if (onProgress && i % progressStep === 0) {
      if (!onProgress(i / outLen)) return null;
    }
    const t = i / ratio;
    const center = Math.floor(t);
    let sum = 0;
    let wsum = 0;
    for (let k = -taps + 1; k <= taps; k++) {
      const idx = center + k;
      if (idx < 0 || idx >= input.length) continue;
      const x = t - idx;
      const sinc = x === 0 ? cutoff : (Math.sin(Math.PI * cutoff * x) / (Math.PI * x));
      // Hann 包络限制旁瓣
      const w = 0.5 * (1 + Math.cos((Math.PI * x) / taps));
      const weight = sinc * w;
      sum += input[idx] * weight;
      wsum += weight;
    }
    out[i] = wsum !== 0 ? sum / wsum : 0;
  }
  return out;
}
