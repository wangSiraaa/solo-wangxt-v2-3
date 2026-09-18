<script lang="ts">
  /**
   * 频谱视图：与波形共享同一选区（选区变化 → 重新分析 → 此处更新）。
   * 对数频率轴，dB 纵轴（地板 -120 dB，静音不产生 -Infinity）。
   */
  import { app } from '../state/app.svelte';
  import { powerToDb, bandPeakFreq, DB_FLOOR } from '../audio/dsp';
  import type { SpectrumResult } from '../types';

  const HEIGHT = 320;
  const PAD_L = 44;
  const PAD_B = 22;
  const PAD_T = 10;
  const PAD_R = 8;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wrap = $state<HTMLDivElement | null>(null);
  let width = $state(800);

  const F_MIN = 20;
  const fs = $derived(
    app.spectrumA?.sampleRate ?? app.spectrumB?.sampleRate ?? app.slots.A?.sampleRate ?? 44100,
  );
  const fMax = $derived(fs / 2);

  const xOf = (f: number, w: number) =>
    PAD_L + ((Math.log10(f) - Math.log10(F_MIN)) / (Math.log10(fMax) - Math.log10(F_MIN))) * (w - PAD_L - PAD_R);
  const yOf = (db: number, h: number) =>
    PAD_T + (1 - (db - DB_FLOOR) / (0 - DB_FLOOR)) * (h - PAD_T - PAD_B);

  function drawSpectrum(
    ctx: CanvasRenderingContext2D,
    spec: SpectrumResult,
    color: string,
    w: number,
    h: number,
  ) {
    const binHz = spec.sampleRate / spec.fftSize;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let k = 1; k < spec.power.length; k++) {
      const f = k * binHz;
      if (f < F_MIN) continue;
      const x = xOf(f, w);
      const y = yOf(powerToDb(spec.power[k]), h);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);
    ctx.font = '11px ui-monospace, monospace';

    // 频段高亮
    const bx0 = xOf(Math.max(F_MIN, app.band.low), width);
    const bx1 = xOf(Math.min(fMax, app.band.high), width);
    ctx.fillStyle = 'rgba(170, 59, 255, 0.10)';
    ctx.fillRect(bx0, PAD_T, bx1 - bx0, HEIGHT - PAD_T - PAD_B);

    // 网格：频率
    const fTicks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 40000];
    ctx.strokeStyle = 'rgba(128,128,128,0.2)';
    ctx.fillStyle = 'rgba(128,128,128,0.9)';
    for (const f of fTicks) {
      if (f < F_MIN || f > fMax) continue;
      const x = xOf(f, width);
      ctx.beginPath();
      ctx.moveTo(x, PAD_T);
      ctx.lineTo(x, HEIGHT - PAD_B);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x - 8, HEIGHT - 8);
    }
    // 网格：dB
    for (let db = 0; db >= DB_FLOOR; db -= 20) {
      const y = yOf(db, HEIGHT);
      ctx.beginPath();
      ctx.moveTo(PAD_L, y);
      ctx.lineTo(width - PAD_R, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 6, y + 3);
    }

    if (app.spectrumA) drawSpectrum(ctx, app.spectrumA, '#0ea5e9', width, HEIGHT);
    if (app.spectrumB) drawSpectrum(ctx, app.spectrumB, '#f59e0b', width, HEIGHT);

    // 频段内峰值标注
    const peaks: Array<[SpectrumResult, string, string]> = [];
    if (app.spectrumA) peaks.push([app.spectrumA, '#0ea5e9', 'A']);
    if (app.spectrumB) peaks.push([app.spectrumB, '#f59e0b', 'B']);
    peaks.forEach(([spec, color, label], i) => {
      const pf = bandPeakFreq(spec.power, spec.sampleRate, spec.fftSize, app.band.low, app.band.high);
      if (pf == null || pf < F_MIN || pf > fMax) return;
      const binHz = spec.sampleRate / spec.fftSize;
      const k = Math.round(pf / binHz);
      const x = xOf(pf, width);
      const y = yOf(powerToDb(spec.power[Math.min(k, spec.power.length - 1)]), HEIGHT);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`${label}峰值 ${pf.toFixed(1)} Hz`, Math.min(x + 6, width - 110), y - 6 - i * 13);
    });

    // 图例
    ctx.fillStyle = '#0ea5e9';
    ctx.fillText('— A', width - 90, PAD_T + 10);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('— B', width - 50, PAD_T + 10);
  }

  $effect(() => {
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      width = wrap!.clientWidth;
    });
    ro.observe(wrap);
    width = wrap.clientWidth;
    return () => ro.disconnect();
  });

  $effect(() => {
    void app.spectrumA;
    void app.spectrumB;
    void app.band;
    void width;
    draw();
  });
</script>

<div class="wrap" bind:this={wrap}>
  <canvas bind:this={canvas} style:width="100%" style:height="{HEIGHT}px"></canvas>
  {#if !app.spectrumA && !app.spectrumB}
    <div class="empty">载入音频并在波形上选择选区后显示频谱</div>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.4rem;
  }
  canvas {
    display: block;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text);
    font-size: 0.9rem;
    pointer-events: none;
  }
</style>
