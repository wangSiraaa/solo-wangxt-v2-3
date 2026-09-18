import type { AudioData } from '../types';
import { decodeWav } from './wav';

/**
 * 解码用户选择的 WAV 文件为单声道 PCM。
 * 优先手动解析 WAV 以保留文件的真实采样率（供显式重采样判断）；
 * 仅当遇到非 PCM 编码时才回退到 decodeAudioData。
 */
export async function decodeWavFile(file: File): Promise<AudioData> {
  const raw = await file.arrayBuffer();
  try {
    const { pcm, sampleRate } = decodeWav(raw);
    return {
      name: file.name,
      pcm,
      sampleRate,
      duration: pcm.length / sampleRate,
    };
  } catch (parseErr) {
    // 非 PCM WAV（如 µ-law）：回退到 Web Audio 解码
    const ctx = new AudioContext();
    try {
      const buf = await ctx.decodeAudioData(raw.slice(0));
      const len = buf.length;
      const pcm = new Float32Array(len);
      const chs = buf.numberOfChannels;
      for (let c = 0; c < chs; c++) {
        const data = buf.getChannelData(c);
        for (let i = 0; i < len; i++) pcm[i] += data[i] / chs;
      }
      return {
        name: file.name,
        pcm,
        sampleRate: buf.sampleRate,
        duration: buf.duration,
      };
    } catch {
      throw parseErr;
    } finally {
      ctx.close();
    }
  }
}
