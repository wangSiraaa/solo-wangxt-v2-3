<script lang="ts">
  import { onMount } from 'svelte';
  import { spectra, bandLowHz, bandHighHz, progress } from '../stores';
  import { DB_FLOOR } from '../audio/dsp';

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let width = 800;
  const height = 260;
  let logScale = true;

  const PAD_L = 44;
  const PAD_B = 22;
  const PAD_T = 8;

  $: maxFreq = Math.max($spectra.A?.freqs.at(-1) ?? 0, $spectra.B?.freqs.at(-1) ?? 0, 1);

  function xOf(freq: number, plotW: number): number {
    if (logScale) {
      const fMin = 20;
      const fMax = Math.max(maxFreq, fMin * 2);
      const t = (Math.log10(Math.max(freq, fMin)) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin));
      return PAD_L + t * plotW;
    }
    return PAD_L + (freq / maxFreq) * plotW;
  }

  function yOf(db: number, plotH: number): number {
    const t = Math.max(0, Math.min(1, db / DB_FLOOR)); // 0 dB 顶，-120 dB 底
    return PAD_T + t * plotH;
  }

  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const plotW = width - PAD_L - 8;
    const plotH = height - PAD_T - PAD_B;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, width, height);

    // dB 网格
    ctx.font = '10px monospace';
    for (let db = 0; db >= DB_FLOOR; db -= 20) {
      const y = yOf(db, plotH);
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(width - 8, y); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${db}`, 8, y + 3);
    }
    // 频率网格
    const ticks = logScale ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : [];
    ctx.fillStyle = '#64748b';
    if (logScale) {
      for (const f of ticks) {
        if (f > maxFreq) continue;
        const x = xOf(f, plotW);
        ctx.strokeStyle = '#172036';
        ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + plotH); ctx.stroke();
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x - 8, height - 8);
      }
    } else {
      for (let i = 1; i <= 8; i++) {
        const f = (maxFreq / 8) * i;
        const x = xOf(f, plotW);
        ctx.strokeStyle = '#172036';
        ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + plotH); ctx.stroke();
        ctx.fillText(`${Math.round(f)}`, x - 10, height - 8);
      }
    }

    // 指定频段高亮
    const bx0 = xOf($bandLowHz, plotW);
    const bx1 = xOf(Math.min($bandHighHz, maxFreq), plotW);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.10)';
    ctx.fillRect(bx0, PAD_T, Math.max(1, bx1 - bx0), plotH);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(bx0 + 0.5, PAD_T + 0.5, Math.max(1, bx1 - bx0) - 1, plotH - 1);
    ctx.setLineDash([]);

    // 频谱曲线
    drawSpectrum(ctx, $spectra.A, '#22d3ee', plotW, plotH);
    drawSpectrum(ctx, $spectra.B, '#fb923c', plotW, plotH);

    if (!$spectra.A && !$spectra.B) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px sans-serif';
      ctx.fillText('在波形上拖动创建选区后，此处显示 A/B 频谱', PAD_L + 20, height / 2);
    }
  }

  function drawSpectrum(
    ctx: CanvasRenderingContext2D,
    r: import('../types').SpectrumResult | null,
    color: string,
    plotW: number,
    plotH: number
  ) {
    if (!r) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k < r.freqs.length; k++) {
      const x = xOf(r.freqs[k], plotW);
      const y = yOf(r.magnitudesDb[k], plotH);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  onMount(() => {
    // rAF 包裹避免 ResizeObserver 循环通知警告
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        width = Math.max(200, container.clientWidth);
        canvas.width = width;
        canvas.height = height;
        draw();
      });
    });
    ro.observe(container);
    return () => ro.disconnect();
  });

  $: if (canvas && ($spectra || $bandLowHz >= 0 || $bandHighHz >= 0 || logScale)) draw();

  function fmtDb(v: number | undefined): string {
    if (v === undefined) return '—';
    return v <= DB_FLOOR ? `≤ ${DB_FLOOR} dB（静音）` : `${v.toFixed(1)} dB`;
  }
</script>

<div class="spectrum" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
  <div class="bar">
    <span class="lg a">A：{fmtDb($spectra.A?.bandEnergyDb)}</span>
    <span class="lg b">B：{fmtDb($spectra.B?.bandEnergyDb)}</span>
    {#if $progress.A !== null}<span class="prog">A 分析中 {Math.round(($progress.A ?? 0) * 100)}%</span>{/if}
    {#if $progress.B !== null}<span class="prog">B 分析中 {Math.round(($progress.B ?? 0) * 100)}%</span>{/if}
    <label class="toggle">
      <input type="checkbox" bind:checked={logScale} /> 对数频率轴
    </label>
  </div>
</div>

<style>
  canvas { display: block; width: 100%; border-radius: 8px; }
  .bar { display: flex; align-items: center; gap: 16px; margin-top: 6px; font-size: 12px; }
  .lg.a { color: #22d3ee; }
  .lg.b { color: #fb923c; }
  .prog { color: #a78bfa; }
  .toggle { margin-left: auto; color: #94a3b8; display: flex; align-items: center; gap: 4px; cursor: pointer; }
</style>
