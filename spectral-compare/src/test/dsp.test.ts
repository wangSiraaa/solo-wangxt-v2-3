import { describe, it, expect } from 'vitest';
import { computeSpectrum } from '../lib/audio/spectrum';
import { resampleSinc } from '../lib/audio/resample';
import { gccPhatAlign } from '../lib/audio/align';
import { powerToDb, DB_FLOOR } from '../lib/audio/dsp';
import { windowValue } from '../lib/audio/windows';
import { generateCalibration, encodeWav } from '../lib/audio/signals';
import { decodeWav } from '../lib/audio/wav';

const SR = 44100;

function sine(freq: number, amp: number, dur: number, sr = SR): Float32Array {
  const n = Math.round(dur * sr);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return pcm;
}

function peakFreq(r: { freqs: Float32Array; magnitudesDb: Float32Array }): number {
  let best = 0;
  for (let k = 1; k < r.freqs.length; k++) if (r.magnitudesDb[k] > r.magnitudesDb[best]) best = k;
  return r.freqs[best];
}

describe('频谱计算', () => {
  it('1 kHz 正弦峰值落在正确频率，幅值约 -6 dB', () => {
    const pcm = sine(1000, 0.5, 1);
    const r = computeSpectrum(pcm, SR, { startSec: 0, endSec: 1 }, 4096, 'hann', 200, 2000)!;
    expect(peakFreq(r)).toBeGreaterThan(980);
    expect(peakFreq(r)).toBeLessThan(1020);
    const peak = Math.max(...r.magnitudesDb);
    expect(peak).toBeGreaterThan(-7);
    expect(peak).toBeLessThan(-5);
  });

  it('静音段不产生 -Infinity，截断到 -120 dB', () => {
    const pcm = new Float32Array(SR); // 全零静音
    const r = computeSpectrum(pcm, SR, { startSec: 0, endSec: 1 }, 4096, 'hann', 200, 2000)!;
    expect(r.bandEnergyDb).toBe(DB_FLOOR);
    for (const v of r.magnitudesDb) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(DB_FLOOR);
    }
  });

  it('校验信号各已知频段能量与标称幅值一致', () => {
    const cal = generateCalibration(SR);
    const sel = { startSec: 0.1, endSec: 2.9 };
    const r100 = computeSpectrum(cal.pcm, SR, sel, 8192, 'hann', 90, 110)!;
    const r1k = computeSpectrum(cal.pcm, SR, sel, 8192, 'hann', 900, 1100)!;
    const r10k = computeSpectrum(cal.pcm, SR, sel, 8192, 'hann', 9900, 10100)!;
    // 标称：0.5 → -6.02 dB，0.25 → -12.04 dB，0.125 → -18.06 dB
    expect(r100.bandEnergyDb).toBeCloseTo(-6.02, 0);
    expect(r1k.bandEnergyDb).toBeCloseTo(-12.04, 0);
    expect(r10k.bandEnergyDb).toBeCloseTo(-18.06, 0);
  });

  it('取消标记使计算中止并返回 null', () => {
    const pcm = sine(1000, 0.5, 1);
    const r = computeSpectrum(pcm, SR, { startSec: 0, endSec: 1 }, 1024, 'hann', 0, 1000, () => true);
    expect(r).toBeNull();
  });
});

describe('重采样', () => {
  it('48 kHz → 44.1 kHz 后频率成分不变、长度按比例', () => {
    const pcm = sine(1000, 0.5, 1, 48000);
    const out = resampleSinc(pcm, 48000, 44100)!;
    expect(out.length).toBe(Math.round(48000 * (44100 / 48000)));
    const r = computeSpectrum(out, 44100, { startSec: 0.1, endSec: 0.9 }, 4096, 'hann', 200, 2000)!;
    expect(peakFreq(r)).toBeGreaterThan(980);
    expect(peakFreq(r)).toBeLessThan(1020);
    const peak = Math.max(...r.magnitudesDb);
    expect(peak).toBeGreaterThan(-7);
    expect(peak).toBeLessThan(-5);
  });

  it('44.1 kHz → 48 kHz 升采样保持频率', () => {
    const pcm = sine(2000, 0.4, 1, 44100);
    const out = resampleSinc(pcm, 44100, 48000)!;
    const r = computeSpectrum(out, 48000, { startSec: 0.1, endSec: 0.9 }, 4096, 'hann', 1000, 3000)!;
    expect(peakFreq(r)).toBeGreaterThan(1960);
    expect(peakFreq(r)).toBeLessThan(2040);
  });
});

/** 确定性伪随机宽带信号（GCC-PHAT 对纯音等周期信号本就病态，实测用宽带信号） */
function noise(len: number, seed = 42): Float32Array {
  let s = seed;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return out;
}

describe('GCC-PHAT 自动对齐', () => {
  it('正确估计 B 延迟 +22.7 ms（1000 采样）', () => {
    const a = noise(SR);
    const delay = 1000;
    const b = new Float32Array(a.length);
    b.set(a.subarray(0, a.length - delay), delay);
    const r = gccPhatAlign(a, b, SR, 1)!;
    expect(r.offsetMs).toBeCloseTo((delay / SR) * 1000, 0);
  });

  it('正确估计负偏移（B 提前 500 采样）', () => {
    const a = noise(SR);
    const delay = -500;
    const b = new Float32Array(a.length);
    b.set(a.subarray(-delay), 0);
    const r = gccPhatAlign(a, b, SR, 1)!;
    expect(r.offsetMs).toBeCloseTo((delay / SR) * 1000, 0);
  });
});

describe('WAV 解码（保留真实采样率）', () => {
  it('16-bit PCM 往返：采样率与幅值保持', async () => {
    const pcm = sine(440, 0.5, 0.1, 48000);
    const blob = encodeWav(pcm, 48000);
    const buf = await blob.arrayBuffer();
    const d = decodeWav(buf);
    expect(d.sampleRate).toBe(48000); // 不被静默重采样
    expect(d.pcm.length).toBe(pcm.length);
    let maxErr = 0;
    for (let i = 0; i < pcm.length; i++) maxErr = Math.max(maxErr, Math.abs(pcm[i] - d.pcm[i]));
    expect(maxErr).toBeLessThan(2 / 32768 + 1e-6);
  });

  it('24-bit PCM 解码', () => {
    const sr = 44100;
    const n = 100;
    const buffer = new ArrayBuffer(44 + n * 3);
    const v = new DataView(buffer);
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 3, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 3, true); v.setUint16(32, 3, true);
    v.setUint16(34, 24, true); ws(36, 'data'); v.setUint32(40, n * 3, true);
    // 写入 0.5 与 -0.5 交替
    for (let i = 0; i < n; i++) {
      const x = Math.round((i % 2 === 0 ? 0.5 : -0.5) * 0x7fffff);
      v.setUint8(44 + i * 3, x & 0xff);
      v.setUint8(45 + i * 3, (x >> 8) & 0xff);
      v.setUint8(46 + i * 3, (x >> 16) & 0xff);
    }
    const d = decodeWav(buffer);
    expect(d.sampleRate).toBe(sr);
    expect(d.pcm[0]).toBeCloseTo(0.5, 3);
    expect(d.pcm[1]).toBeCloseTo(-0.5, 3);
  });
});

describe('基础工具', () => {
  it('dB 换算有下限', () => {
    expect(powerToDb(0)).toBe(DB_FLOOR);
    expect(powerToDb(1)).toBeCloseTo(0);
    expect(powerToDb(0.01)).toBeCloseTo(-20);
  });

  it('窗函数端点特性', () => {
    expect(windowValue('rectangular', 0, 100)).toBe(1);
    expect(windowValue('hann', 0, 100)).toBeCloseTo(0);
    expect(windowValue('hann', 50, 101)).toBeCloseTo(1);
    expect(windowValue('blackman', 0, 100)).toBeCloseTo(0);
  });
});
