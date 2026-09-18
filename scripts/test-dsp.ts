/**
 * DSP  sanity 校验（node scripts，非浏览器）：
 *  1. 1000 Hz / 幅值 0.5 正弦 → 900–1100 Hz 频段能量 ≈ -9.03 dB（A²/2）
 *  2. 频段峰值频率 ≈ 1000 Hz（抛物线插值）
 *  3. 静音段 → dB 地板 -120，绝不出现 -Infinity / NaN
 *  4. 显式重采样 48k → 44.1k：长度比例与信号频率保持
 *  5. 互相关偏移估计：B = A 延迟 0.35 s → lag ≈ +0.35 s
 *  6. 全频段能量 ≈ 时域均方值（Parseval 一致性）
 */
import { WelchAccumulator } from '../src/lib/audio/welch';
import { estimateLag } from '../src/lib/audio/xcorr';
import { powerToDb, bandEnergy, bandPeakFreq, DB_FLOOR } from '../src/lib/audio/dsp';
import { resampleLinear } from '../src/lib/audio/resample';

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failures++;
}

function welch(samples: Float32Array, fftSize: number): Float32Array {
  const acc = new WelchAccumulator(fftSize, 'hann');
  const hop = fftSize >> 1;
  const nFrames = Math.max(1, Math.floor((samples.length - fftSize) / hop) + 1);
  for (let f = 0; f < nFrames; f++) acc.addFrame(samples, f * hop);
  return acc.spectrum();
}

const FS = 44100;
const FFT_SIZE = 4096;

// --- 1 & 2：校验信号 ---
{
  const dur = 3;
  const n = FS * dur;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / FS);
  const power = welch(x, FFT_SIZE);
  const eDb = powerToDb(bandEnergy(power, FS, FFT_SIZE, 900, 1100));
  // 理论值 10*log10(0.5²/2) = -9.03 dB
  check('1kHz 正弦频段能量', Math.abs(eDb - -9.03) < 0.5, `${eDb.toFixed(2)} dB, 期望 -9.03 dB`);
  const peak = bandPeakFreq(power, FS, FFT_SIZE, 900, 1100);
  check('1kHz 峰值频率', peak != null && Math.abs(peak - 1000) < 2, `${peak?.toFixed(2)} Hz`);
}

// --- 3：静音 dB 地板 ---
{
  const silence = new Float32Array(FS); // 全零
  const power = welch(silence, FFT_SIZE);
  const eDb = powerToDb(bandEnergy(power, FS, FFT_SIZE, 100, 10000));
  check(
    '静音不产生 -Infinity',
    Number.isFinite(eDb) && eDb === DB_FLOOR,
    `${eDb} dB（地板 ${DB_FLOOR}）`,
  );
  check('powerToDb(0) 有限', Number.isFinite(powerToDb(0)), `${powerToDb(0)} dB`);
}

// --- 4：显式重采样 ---
{
  const n48 = 48000;
  const x = new Float32Array(n48);
  for (let i = 0; i < n48; i++) x[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
  const y = resampleLinear(x, 48000, 44100);
  const expectedLen = Math.round((n48 * 44100) / 48000);
  check('重采样长度', y.length === expectedLen, `${y.length} vs ${expectedLen}`);
  const power = welch(y, FFT_SIZE);
  const peak = bandPeakFreq(power, FS, FFT_SIZE, 300, 600);
  check('重采样后频率保持', peak != null && Math.abs(peak - 440) < 3, `${peak?.toFixed(2)} Hz`);
}

// --- 5：互相关偏移符号约定 ---
{
  const n = FS * 4;
  const a = new Float32Array(n);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    a[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  const delaySec = 0.35;
  const delayN = Math.round(delaySec * FS);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = i >= delayN ? a[i - delayN] : 0;
  const { lagSec, confidence } = estimateLag(a, b, FS, 5);
  check(
    '互相关偏移 ≈ +0.35 s',
    Math.abs(lagSec - delaySec) < 0.01,
    `lag=${lagSec.toFixed(4)} s, 相关强度=${confidence.toFixed(1)}`,
  );
}

// --- 6：Parseval 一致性 ---
{
  const n = FS;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 500 * i) / FS);
  const power = welch(x, FFT_SIZE);
  let total = 0;
  for (const p of power) total += p;
  let meanSq = 0;
  for (const v of x) meanSq += v * v;
  meanSq /= n;
  const ratio = total / meanSq;
  check(
    '全频段能量 ≈ 时域均方值',
    ratio > 0.9 && ratio < 1.1,
    `比值 ${ratio.toFixed(3)}（Hann 50% 重叠有轻微幅度调制）`,
  );
}

process.exit(failures ? 1 : 0);
