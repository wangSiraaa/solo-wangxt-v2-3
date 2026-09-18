/**
 * 内置测试信号：可播放样音与频率已知的校验信号。
 * 全部在本地合成，可试听、下载 WAV 或直接载入 A/B 通道。
 */

export interface GeneratedSignal {
  name: string;
  description: string;
  sampleRate: number;
  pcm: Float32Array;
  /** 校验信号的频率/幅值说明，用于界面展示与结果核对 */
  knownComponents?: { freqHz: number; amplitude: number }[];
}

function applyFades(pcm: Float32Array, sampleRate: number, fadeMs = 5): void {
  const n = Math.min(pcm.length >> 1, Math.round((fadeMs / 1000) * sampleRate));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    pcm[i] *= g;
    pcm[pcm.length - 1 - i] *= g;
  }
}

/** 可播放样音：440 Hz 正弦，-6 dBFS，2 秒 */
export function generateSampleTone(sampleRate = 44100): GeneratedSignal {
  const dur = 2;
  const pcm = new Float32Array(Math.round(dur * sampleRate));
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  applyFades(pcm, sampleRate);
  return {
    name: 'sample-tone-440Hz.wav',
    description: '样音：440 Hz 正弦，幅值 0.5（-6 dBFS），2 s',
    sampleRate,
    pcm,
    knownComponents: [{ freqHz: 440, amplitude: 0.5 }],
  };
}

/** 校验信号：100 Hz / 1 kHz / 10 kHz 三个已知频率、已知幅值的分量叠加，3 秒 */
export function generateCalibration(sampleRate = 44100): GeneratedSignal {
  const components = [
    { freqHz: 100, amplitude: 0.5 },
    { freqHz: 1000, amplitude: 0.25 },
    { freqHz: 10000, amplitude: 0.125 },
  ];
  const dur = 3;
  const pcm = new Float32Array(Math.round(dur * sampleRate));
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (const c of components) v += c.amplitude * Math.sin(2 * Math.PI * c.freqHz * t);
    pcm[i] = v;
  }
  applyFades(pcm, sampleRate);
  return {
    name: 'calibration-100-1k-10k.wav',
    description: '校验信号：100 Hz(-6 dB) + 1 kHz(-12 dB) + 10 kHz(-18 dB)，3 s',
    sampleRate,
    pcm,
    knownComponents: components,
  };
}

/** 白噪声样音：幅值 0.1（-20 dBFS），2 秒 */
export function generateNoise(sampleRate = 44100): GeneratedSignal {
  const dur = 2;
  const pcm = new Float32Array(Math.round(dur * sampleRate));
  for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.random() * 2 - 1) * 0.1;
  applyFades(pcm, sampleRate);
  return {
    name: 'white-noise.wav',
    description: '白噪声，幅值 0.1（-20 dBFS），2 s',
    sampleRate,
    pcm,
  };
}

/** 带静音段的样音：0.5 s 静音 + 1 s 1 kHz + 0.5 s 静音，用于验证静音不产生 -∞ dB */
export function generateSilenceTone(sampleRate = 44100): GeneratedSignal {
  const sr = sampleRate;
  const pcm = new Float32Array(Math.round(2 * sr));
  const start = Math.round(0.5 * sr);
  const end = Math.round(1.5 * sr);
  for (let i = start; i < end; i++) {
    pcm[i] = 0.4 * Math.sin((2 * Math.PI * 1000 * (i - start)) / sr);
  }
  applyFades(pcm, sr);
  return {
    name: 'silence-1khz-silence.wav',
    description: '静音-1 kHz-静音：验证静音段分贝有下限（-120 dB）',
    sampleRate,
    pcm,
    knownComponents: [{ freqHz: 1000, amplitude: 0.4 }],
  };
}

/** Float32 PCM → 16-bit PCM WAV Blob */
export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const numSamples = pcm.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
