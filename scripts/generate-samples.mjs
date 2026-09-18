// 生成交付用样音（纯本地，Node 运行一次即可）：
//  public/samples/verify-1khz.wav  —— 频率已知的校验信号：1000 Hz 正弦，幅值 0.5（理论功率 -9.03 dBFS）
//  public/samples/sample-a.wav     —— 可播放样音 A：旋律片段，44.1 kHz
//  public/samples/sample-b.wav     —— 可播放样音 B：同一旋律延迟 0.35 s、高频变暗、电平约 -3 dB，48 kHz
// B 与 A 采样率不同（48k vs 44.1k），用于演示“先明确重采样”；0.35 s 延迟用于演示时间偏移校准。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');
mkdirSync(outDir, { recursive: true });

function writeWav(path, samples, sampleRate) {
  const n = samples.length;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
  console.log(`wrote ${path}  (${(n / sampleRate).toFixed(2)} s @ ${sampleRate} Hz)`);
}

// ---------- 校验信号：1000 Hz 正弦 ----------
{
  const fs = 44100, dur = 3, f = 1000, amp = 0.5;
  const n = Math.round(fs * dur);
  const x = new Float32Array(n);
  const fade = Math.round(0.01 * fs);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fade) g = i / fade;
    if (i > n - fade) g = (n - i) / fade;
    x[i] = amp * Math.sin((2 * Math.PI * f * i) / fs) * g;
  }
  writeWav(join(outDir, 'verify-1khz.wav'), x, fs);
}

// ---------- 旋律样音 A / B ----------
const NOTES = [440.0, 554.37, 659.25, 880.0, 659.25, 554.37, 440.0, 329.63]; // A4 C#5 E5 A5 ...
const NOTE_DUR = 0.9, GAP = 0.1;

function renderMelody({ fs, delaySec, harmonics, amp, noiseAmp }) {
  const total = NOTES.length * (NOTE_DUR + GAP) + delaySec + 0.2;
  const n = Math.round(total * fs);
  const x = new Float32Array(n);
  const delay = Math.round(delaySec * fs);
  NOTES.forEach((freq, idx) => {
    const start = delay + Math.round(idx * (NOTE_DUR + GAP) * fs);
    const len = Math.round(NOTE_DUR * fs);
    const attack = Math.round(0.02 * fs), release = Math.round(0.08 * fs);
    for (let i = 0; i < len; i++) {
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > len - release) env = (len - i) / release;
      let s = 0;
      for (let h = 1; h <= harmonics; h++) s += (1 / h) * Math.sin((2 * Math.PI * freq * h * i) / fs);
      x[start + i] += amp * env * s * 0.5;
    }
  });
  // 轻微本底噪声，避免静音段（同时演示 dB 地板之外的正常读数）
  let seed = 42;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    x[i] += noiseAmp * ((seed / 0x7fffffff) * 2 - 1);
  }
  return x;
}

writeWav(
  join(outDir, 'sample-a.wav'),
  renderMelody({ fs: 44100, delaySec: 0, harmonics: 4, amp: 0.6, noiseAmp: 0.002 }),
  44100,
);
writeWav(
  join(outDir, 'sample-b.wav'),
  renderMelody({ fs: 48000, delaySec: 0.35, harmonics: 2, amp: 0.42, noiseAmp: 0.002 }),
  48000,
);
