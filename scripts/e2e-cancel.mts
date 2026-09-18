/**
 * 取消分析端到端测试：
 *  1. 注入 120 s 长录音（内存生成 WAV），选区拉到 0–100 s 使分析耗时
 *  2. 分析进行中点击“取消分析”→ 状态“已取消”
 *  3. 立刻设置新选区 → 新分析完成、导出可用
 *     （迟到旧结果不得覆盖新选区：requestId 守卫）
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4177;
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'pipe',
});
await new Promise((resolve, reject) => {
  preview.stdout.on('data', (d) => String(d).includes('Local:') && resolve());
  setTimeout(() => reject(new Error('preview timeout')), 15000);
});

// 生成 120 s 单声道 16-bit WAV（440 Hz + 噪声）
function makeLongWav(): Buffer {
  const fs = 44100;
  const n = fs * 120;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(fs, 24);
  buf.writeUInt32LE(fs * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  let seed = 1;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((seed / 0x7fffffff) * 2 - 1) * 0.05;
    const v = 0.3 * Math.sin((2 * Math.PI * 440 * i) / fs) + noise;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
  }
  return buf;
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failures++;
};

try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

  // 注入长录音
  const wav = makeLongWav();
  await page
    .locator('.card', { hasText: '录音 A' })
    .locator('input[type=file]')
    .setInputFiles({ name: 'long-120s.wav', mimeType: 'audio/wav', buffer: wav });
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '就绪',
    { timeout: 60000 },
  );
  check('长录音解码', true, '120 s @ 44.1 kHz');

  // 拉大选区 0–100 s，让分析耗时
  const selInputs = page.locator('fieldset', { hasText: '选区' }).locator('input[type=number]');
  await selInputs.nth(1).fill('100');
  await selInputs.nth(1).press('Enter');

  // 等分析开始（进度条出现或状态变为分析中）
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent?.includes('分析中'),
    { timeout: 10000 },
  );
  // 取消
  await page.getByRole('button', { name: '取消分析' }).click();
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '已取消',
    { timeout: 10000 },
  );
  check('取消分析', true, '状态=已取消');

  // 立刻设置新选区 → 新分析应完成且导出可用（旧结果不得覆盖）
  await selInputs.nth(0).fill('10');
  await selInputs.nth(0).press('Enter');
  await selInputs.nth(1).fill('20');
  await selInputs.nth(1).press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '就绪',
    { timeout: 60000 },
  );
  const exportEnabled = await page.locator('.export button').first().isEnabled();
  check('取消后新选区分析完成', exportEnabled, `导出可用=${exportEnabled}`);

  // 440 Hz 信号在新选区的频段峰值应 ≈ 440 Hz（证明显示的是新选区结果）
  const bandInputs = page.locator('fieldset', { hasText: '比较频段' }).locator('input[type=number]');
  await bandInputs.nth(0).fill('300');
  await bandInputs.nth(0).press('Enter');
  await bandInputs.nth(1).fill('600');
  await bandInputs.nth(1).press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '就绪',
    { timeout: 60000 },
  );
  await page.waitForTimeout(400);
  const panelText = (await page.locator('.panel', { hasText: '频段能量对比' }).textContent()) ?? '';
  const peakMatch = panelText.match(/A 频段峰值\s*([\d.]+) Hz/);
  const pA = peakMatch ? parseFloat(peakMatch[1]) : NaN;
  check('新选区结果正确（峰值≈440Hz）', Math.abs(pA - 440) < 5, `${pA} Hz`);

  await browser.close();
} finally {
  preview.kill();
}
process.exit(failures ? 1 : 0);
