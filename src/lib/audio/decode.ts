/**
 * 用 Web Audio API 解码用户选择的 WAV 文件，并混合为单声道用于分析。
 *
 * 注意：AudioContext.decodeAudioData 会把音频隐式重采样到 context 的采样率。
 * 为保证“采样率不同先明确重采样”，这里先解析 WAV 头得到文件真实采样率，
 * 再用相同采样率的 OfflineAudioContext 解码 —— 分析链路上没有任何隐式重采样，
 * 唯一的重采样是 resample.ts 中的显式线性插值。
 * 原始文件只在本机内存中处理，不上传任何服务器。
 */

/** 从 RIFF/WAVE 头解析真实采样率；非 WAV 或解析失败返回 null */
export function wavSampleRate(data: ArrayBuffer): number | null {
  if (data.byteLength < 44) return null;
  const v = new DataView(data);
  if (v.getUint32(0, false) !== 0x52494646) return null; // 'RIFF'
  if (v.getUint32(8, false) !== 0x57415645) return null; // 'WAVE'
  let off = 12;
  while (off + 8 <= data.byteLength) {
    const chunkId = v.getUint32(off, false);
    const chunkSize = v.getUint32(off + 4, true);
    if (chunkId === 0x666d7420 && off + 16 <= data.byteLength) {
      // 'fmt '：偏移 +12 处为采样率（小端）
      return v.getUint32(off + 12, true);
    }
    off += 8 + chunkSize + (chunkSize & 1);
  }
  return null;
}

export async function decodeToMono(
  data: ArrayBuffer,
): Promise<{ pcm: Float32Array; sampleRate: number; buffer: AudioBuffer }> {
  // 以文件真实采样率解码，杜绝隐式重采样（非 WAV 时退回 44100）
  const rate = wavSampleRate(data) ?? 44100;
  const ctx = new OfflineAudioContext(1, 1, rate);
  const buffer = await ctx.decodeAudioData(data);
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const pcm = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) pcm[i] += d[i] / ch;
  }
  return { pcm, sampleRate: buffer.sampleRate, buffer };
}

/** 从持久化的 PCM 重建可播放的 AudioBuffer */
export function pcmToBuffer(
  ctx: AudioContext,
  pcm: Float32Array,
  sampleRate: number,
): AudioBuffer {
  const buf = ctx.createBuffer(1, pcm.length, sampleRate);
  buf.getChannelData(0).set(pcm);
  return buf;
}
