/**
 * 手动解析 WAV（PCM 16/24/32 bit 整型与 32/64 bit 浮点）。
 *
 * 为什么不用 decodeAudioData：它会以 AudioContext 的采样率
 * 静默重采样，用户完全感知不到原始采样率——本工具要求
 * 采样率不一致时“明确”重采样，因此必须拿到文件的真实采样率。
 */

export interface DecodedWav {
  pcm: Float32Array;
  sampleRate: number;
}

const RIFF = 0x52494646; // 'RIFF'
const FMT = 0x666d7420; // 'fmt '
const DATA = 0x64617461; // 'data'

export function decodeWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || view.getUint32(0, false) !== RIFF) {
    throw new Error('不是有效的 RIFF/WAV 文件');
  }
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLen = 0;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === FMT) {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === DATA) {
      dataOffset = offset + 8;
      dataLen = Math.min(size, view.byteLength - dataOffset);
    }
    offset += 8 + size + (size % 2); // 块按 2 字节对齐
  }

  if (!channels || !sampleRate || dataOffset < 0) {
    throw new Error('WAV 缺少 fmt 或 data 块');
  }
  const bytesPerSample = bits / 8;
  if (format !== 1 && format !== 3) {
    throw new Error(`不支持的 WAV 编码（format=${format}），仅支持 PCM 整型与 IEEE 浮点`);
  }
  if (![2, 3, 4, 8].includes(bytesPerSample)) {
    throw new Error(`不支持的位深 ${bits} bit`);
  }

  const frames = Math.floor(dataLen / (channels * bytesPerSample));
  const pcm = new Float32Array(frames);
  const frameBytes = channels * bytesPerSample;

  for (let i = 0; i < frames; i++) {
    const base = dataOffset + i * frameBytes;
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const o = base + c * bytesPerSample;
      let v: number;
      if (format === 3) {
        v = bytesPerSample === 8 ? view.getFloat64(o, true) : view.getFloat32(o, true);
      } else if (bytesPerSample === 2) {
        v = view.getInt16(o, true) / 0x8000;
      } else if (bytesPerSample === 3) {
        // 24-bit：手动拼有符号整数
        const b0 = view.getUint8(o);
        const b1 = view.getUint8(o + 1);
        const b2 = view.getUint8(o + 2);
        let x = b0 | (b1 << 8) | (b2 << 16);
        if (x & 0x800000) x |= ~0xffffff;
        v = x / 0x800000;
      } else {
        v = view.getInt32(o, true) / 0x80000000;
      }
      sum += v;
    }
    pcm[i] = sum / channels;
  }
  return { pcm, sampleRate };
}
