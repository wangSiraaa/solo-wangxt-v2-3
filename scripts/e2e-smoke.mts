/**
 * 端到端冒烟测试（Playwright + 构建产物 vite preview）：
 *  1. 载入示例 A/B → B 显示“已显式重采样 48000 → 44100”
 *  2. 自动估计偏移 ≈ 0.350 s
 *  3. 载入 1 kHz 校验信号 → 频段能量 ≈ -9 dB，峰值 ≈ 1000 Hz
 *  4. 双击波形添加标记 → 刷新后标记恢复（IndexedDB）
 *  5. 导出按钮可用
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'pipe',
});
await new Promise((resolve, reject) => {
  preview.stdout.on('data', (d) => {
    if (String(d).includes('Local:')) resolve();
  });
  preview.stderr.on('data', (d) => console.error('[preview]', String(d)));
  setTimeout(() => reject(new Error('preview start timeout')), 15000);
});

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) failures++;
};

try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=录音频谱比对', { timeout: 10000 });

  const cardA = page.locator('.card', { hasText: '录音 A' });
  const cardB = page.locator('.card', { hasText: '录音 B' });

  // --- 1. 载入示例 A/B ---
  await cardA.getByRole('button', { name: '载入示例 A' }).click();
  await cardB.getByRole('button', { name: '载入示例 B' }).click();
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '就绪',
    { timeout: 20000 },
  );
  const resampleNote = await cardB.locator('.resample-note').textContent();
  check(
    'B 显式重采样提示',
    resampleNote?.includes('48000 → 44100') ?? false,
    resampleNote?.trim() ?? '无',
  );

  // --- 2. 自动估计偏移 ---
  await page.getByRole('button', { name: '自动估计偏移' }).click();
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent?.includes('偏移 ≈'),
    { timeout: 30000 },
  );
  const offsetVal = await page.locator('.offset input[type=number]').inputValue();
  check('自动偏移 ≈ 0.35 s', Math.abs(parseFloat(offsetVal) - 0.35) < 0.01, offsetVal);

  // --- 3. 1 kHz 校验信号 ---
  await cardA.getByRole('button', { name: '1 kHz 校验信号' }).click();
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '就绪',
    { timeout: 20000 },
  );
  // 设置频段 900–1100 Hz
  const bandField = page.locator('fieldset', { hasText: '比较频段' });
  const bandInputs = bandField.locator('input[type=number]');
  await bandInputs.nth(0).fill('900');
  await bandInputs.nth(0).press('Enter');
  await bandInputs.nth(1).fill('1100');
  await bandInputs.nth(1).press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.status-text')?.textContent === '就绪',
    { timeout: 20000 },
  );
  await page.waitForTimeout(500);
  const panelText = (await page.locator('.panel', { hasText: '频段能量对比' }).textContent()) ?? '';
  const energyMatch = panelText.match(/A 能量\s*(-?\d+\.\d) dB/);
  const peakMatch = panelText.match(/A 频段峰值\s*([\d.]+) Hz/);
  const eA = energyMatch ? parseFloat(energyMatch[1]) : NaN;
  const pA = peakMatch ? parseFloat(peakMatch[1]) : NaN;
  check('校验信号能量 ≈ -9.03 dB', Math.abs(eA - -9.03) < 1.0, `${eA} dB`);
  check('校验信号峰值 ≈ 1000 Hz', Math.abs(pA - 1000) < 5, `${pA} Hz`);

  // --- 4. 标记持久化 ---
  const canvas = page.locator('canvas').first();
  await canvas.dblclick({ position: { x: 300, y: 60 } });
  await page.waitForSelector('text=M1', { timeout: 5000 });
  await page.waitForTimeout(600); // 等防抖持久化写入 IndexedDB
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=M1', { timeout: 10000 });
  const markerText = await page.locator('.panel', { hasText: '标记' }).textContent();
  check('刷新后标记恢复', markerText?.includes('M1') ?? false, markerText?.trim().slice(0, 60));
  const restoredA = await cardA.locator('.meta').textContent();
  check('刷新后音频恢复', restoredA?.includes('verify-1khz.wav') ?? false, 'A 卡片含文件名');

  // --- 5. 导出按钮（等刷新后的重新分析完成） ---
  const exportBtns = page.getByRole('button', { name: /导出 (JSON|CSV)/ });
  let enabled = false;
  try {
    await page.waitForFunction(
      () => !(document.querySelector('.export button') as HTMLButtonElement | null)?.disabled,
      { timeout: 20000 },
    );
    enabled = true;
  } catch {
    enabled = false;
  }
  check('导出按钮可用', enabled && (await exportBtns.count()) === 2, `${await exportBtns.count()} 个按钮`);

  await browser.close();
} finally {
  preview.kill();
}

process.exit(failures ? 1 : 0);
