/* 端到端冒烟测试 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/';
let failures = 0;
const ok = (cond, name) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failures++;
};

/** 在 Node 侧合成 48 kHz 16-bit WAV（用于触发显式重采样路径） */
function wav48k() {
  const sr = 48000;
  const n = sr; // 1 s 1 kHz
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(0.5 * Math.sin(2 * Math.PI * 1000 * i / sr) * 32767), 44 + i * 2);
  }
  return buf;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
page.on('pageerror', (e) => { console.log('PAGE ERROR:', e.message); failures++; });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('text=录音频谱比对台');
ok(true, '应用加载');

// 1. 生成校验信号并载入 A/B
await page.click('text=校验信号 100/1k/10k Hz');
await page.waitForSelector('audio');
ok(true, '校验信号生成，可播放');
await page.click('text=载入 A');
await page.click('text=载入 B');
await page.waitForSelector('text=calibration-100-1k-10k.wav >> nth=0');
ok(true, '信号载入 A/B');

// 2. 波形拖动创建共享选区（10% → 90%）
const canvas = page.locator('.waveform canvas');
await canvas.scrollIntoViewIfNeeded();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForSelector('text=清除选区');
ok(true, '选区创建（波形/频谱共享）');

// 3. 设置频段 90–110 Hz，等待频段能量 ≈ -6 dB（标称 0.5 幅值）
await page.locator('label:has-text("频段下限") input').fill('90');
await page.locator('label:has-text("频段上限") input').fill('110');
await page.waitForFunction(() => {
  const cells = [...document.querySelectorAll('.grid .v')];
  return cells.length >= 2 && cells[0].textContent.includes('-');
}, { timeout: 8000 });
const readBand = async () => {
  const cells = await page.locator('.grid .v').allTextContents();
  return cells.map((t) => parseFloat(t));
};
await page.waitForTimeout(600);
let [ea, eb] = await readBand();
ok(Math.abs(ea - -6.02) < 1.0, `A 频段能量 ≈ -6 dB（实际 ${ea}）`);
ok(Math.abs(eb - -6.02) < 1.0, `B 频段能量 ≈ -6 dB（实际 ${eb}）`);

// 4. 切换窗函数，结果应重算且仍合理
await page.locator('.params select').first().selectOption('blackman');
await page.waitForTimeout(800);
[ea] = await readBand();
ok(Math.abs(ea - -6.02) < 1.5, `切换 Blackman 窗后能量仍合理（${ea}）`);
await page.locator('.params select').first().selectOption('hann');

// 5. 时间偏移校准：设置 +100 ms，B 选区平移后能量应基本不变（信号持续 3 s）
await page.locator('.num input').fill('100');
await page.waitForTimeout(800);
[, eb] = await readBand();
ok(Math.abs(eb - -6.02) < 1.5, `偏移 +100 ms 后 B 能量仍合理（${eb}）`);
await page.locator('.num input').fill('0');
await page.waitForTimeout(900); // 等待偏移 0 的重分析与方案保存落盘

// 6. 取消分析：结果清空，频段能量显示 —
await page.click('text=取消分析');
await page.waitForTimeout(300);
const afterCancel = await page.locator('.grid .v').first().textContent();
ok(afterCancel.includes('—'), `取消分析后结果清空（实际 "${afterCancel.trim()}"）`);

// 7. 刷新后恢复标记位置（IndexedDB 持久化）
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=清除选区', { timeout: 8000 });
ok(true, '刷新后选区标记已恢复');
const plan = await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('spectral-compare', 1);
  req.onsuccess = () => {
    const tx = req.result.transaction('plans', 'readonly');
    const all = tx.objectStore('plans').getAll();
    all.onsuccess = () => resolve(all.result[0] ?? null);
  };
}));
ok(plan && plan.selection && plan.selection.endSec > plan.selection.startSec,
  `IndexedDB 中方案含选区（${JSON.stringify(plan?.selection)}）`);
ok(plan && plan.offsetMs === 0 && plan.windowFn === 'hann', '方案参数已持久化');

// 8. 静音段不产生无限大分贝：生成 静音-1kHz-静音，选静音区
// （刷新后生成器列表已重置，这是第一个 audio 元素）
await page.click('text=静音-1kHz-静音');
await page.waitForSelector('audio');
await page.locator('.entry', { hasText: '静音-1 kHz-静音' }).locator('text=载入 A').click();
await page.waitForTimeout(300);
// 选 2%–18%（对应 0.04–0.36 s，全静音）
await canvas.scrollIntoViewIfNeeded();
const box2 = await canvas.boundingBox();
await page.mouse.move(box2.x + box2.width * 0.02, box2.y + box2.height / 2);
await page.mouse.down();
await page.mouse.move(box2.x + box2.width * 0.18, box2.y + box2.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForFunction(() => {
  const c = document.querySelector('.grid .v');
  return c && c.textContent.includes('静音');
}, { timeout: 8000 });
ok(true, '静音选区显示 ≤ -120 dB（无 -Infinity）');

// 9. 迟到结果不得覆盖新选区：先选 1 kHz 音区，立刻改选静音区，
//    最终结果必须是静音（若旧选区的迟到结果覆盖，会显示约 -8 dB）
await canvas.scrollIntoViewIfNeeded();
const box25 = await canvas.boundingBox();
const drag = async (f0, f1) => {
  await page.mouse.move(box25.x + box25.width * f0, box25.y + box25.height / 2);
  await page.mouse.down();
  await page.mouse.move(box25.x + box25.width * f1, box25.y + box25.height / 2, { steps: 4 });
  await page.mouse.up();
};
await drag(0.25, 0.75); // 音区
await drag(0.02, 0.18); // 立即改选静音区（旧分析结果应被丢弃）
await page.waitForFunction(() => {
  const c = document.querySelector('.grid .v');
  return c && c.textContent.includes('静音');
}, { timeout: 8000 });
await page.waitForTimeout(1200); // 等可能的迟到结果
const finalCell = await page.locator('.grid .v').first().textContent();
ok(finalCell.includes('静音'), `迟到结果未覆盖新选区（最终 "${finalCell.trim()}"）`);

// 10. 采样率不一致 → 显式重采样提示
await page.click('text=样音 440 Hz');
await page.waitForSelector('audio >> nth=1');
await page.locator('.entry', { hasText: '440 Hz' }).locator('text=载入 A').click();
const fileInputs = page.locator('.slot input[type=file]');
await fileInputs.nth(1).setInputFiles({ name: 'tone-48k.wav', mimeType: 'audio/wav', buffer: wav48k() });
await page.waitForSelector('text=已显式重采样', { timeout: 15000 });
ok(true, '48 kHz → 44.1 kHz 显式重采样并提示');

// 11. 导出按钮可用
await canvas.scrollIntoViewIfNeeded();
const box3 = await canvas.boundingBox();
await page.mouse.move(box3.x + box3.width * 0.2, box3.y + box3.height / 2);
await page.mouse.down();
await page.mouse.move(box3.x + box3.width * 0.8, box3.y + box3.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(1000);
const csvEnabled = await page.locator('text=导出频谱 CSV').isEnabled();
ok(csvEnabled, '分析完成后导出按钮可用');

await page.screenshot({ path: '/tmp/e2e-final.png', fullPage: true });
await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
