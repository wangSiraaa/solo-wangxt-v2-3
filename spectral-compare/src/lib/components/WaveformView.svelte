<script lang="ts">
  import { onMount } from 'svelte';
  import { fileA, fileB, selection, offsetMs } from '../stores';
  import type { AudioData } from '../types';

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let width = 800;
  const height = 180;

  // 包络缓存：避免每次重绘都扫描全部采样
  let envCache: { audio: AudioData; width: number; shiftSec: number; min: Float32Array; max: Float32Array } | null = null;

  function envelope(audio: AudioData, w: number, shiftSec: number) {
    if (
      envCache &&
      envCache.audio === audio &&
      envCache.width === w &&
      Math.abs(envCache.shiftSec - shiftSec) < 1e-9
    ) {
      return envCache;
    }
    const min = new Float32Array(w).fill(Infinity);
    const max = new Float32Array(w).fill(-Infinity);
    const dur = audio.duration;
    for (let x = 0; x < w; x++) {
      const t0 = (x / w) * dur - shiftSec;
      const t1 = ((x + 1) / w) * dur - shiftSec;
      let i0 = Math.floor(t0 * audio.sampleRate);
      let i1 = Math.ceil(t1 * audio.sampleRate);
      i0 = Math.max(0, Math.min(audio.pcm.length, i0));
      i1 = Math.max(0, Math.min(audio.pcm.length, i1));
      if (i1 <= i0) i1 = Math.min(audio.pcm.length, i0 + 1);
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i < i1; i++) {
        const v = audio.pcm[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo !== Infinity) { min[x] = lo; max[x] = hi; }
    }
    envCache = { audio, width: w, shiftSec, min, max };
    return envCache;
  }

  function drawEnvelope(ctx: CanvasRenderingContext2D, audio: AudioData, shiftSec: number, color: string) {
    const env = envelope(audio, width, shiftSec);
    const mid = height / 2;
    const amp = height / 2 - 6;
    ctx.fillStyle = color;
    for (let x = 0; x < width; x++) {
      if (env.min[x] === Infinity) continue;
      const y0 = mid - env.max[x] * amp;
      const y1 = mid - env.min[x] * amp;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }

  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, width, height);

    const a = $fileA;
    const b = $fileB;
    const dur = a?.duration ?? b?.duration ?? 0;
    if (dur <= 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px sans-serif';
      ctx.fillText('加载 WAV 文件后在此拖动创建选区', 16, height / 2);
      return;
    }

    // 时间网格
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    const step = niceStep(dur / 8);
    for (let t = 0; t <= dur; t += step) {
      const x = (t / dur) * width;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      ctx.fillText(`${t.toFixed(step < 1 ? 2 : 1)}s`, x + 3, height - 6);
    }

    // 零线
    ctx.strokeStyle = '#334155';
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();

    // B 按校准偏移平移显示：偏移 +100ms 表示 B 内容更晚，波形左移
    if (b) drawEnvelope(ctx, b, $offsetMs / 1000, 'rgba(251, 146, 60, 0.75)');
    if (a) drawEnvelope(ctx, a, 0, 'rgba(34, 211, 238, 0.75)');

    // 共享选区
    const sel = $selection;
    if (sel) {
      const x0 = (sel.startSec / dur) * width;
      const x1 = (sel.endSec / dur) * width;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
      ctx.fillRect(x0, 0, x1 - x0, height);
      ctx.strokeStyle = '#3b82f6';
      ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, height - 1);
      ctx.fillStyle = '#93c5fd';
      ctx.font = '11px monospace';
      ctx.fillText(`${sel.startSec.toFixed(3)}s → ${sel.endSec.toFixed(3)}s (${(sel.endSec - sel.startSec).toFixed(3)}s)`, x0 + 4, 14);
    }
  }

  function niceStep(raw: number): number {
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
    return 10 * mag;
  }

  // ---- 拖动创建共享选区 ----
  let dragStart: number | null = null;

  function eventTime(e: PointerEvent): number {
    const rect = canvas.getBoundingClientRect();
    const dur = $fileA?.duration ?? $fileB?.duration ?? 1;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return frac * dur;
  }

  function onDown(e: PointerEvent) {
    if (!$fileA && !$fileB) return;
    canvas.setPointerCapture(e.pointerId);
    dragStart = eventTime(e);
    selection.set({ startSec: dragStart, endSec: dragStart });
  }
  function onMove(e: PointerEvent) {
    if (dragStart === null) return;
    const t = eventTime(e);
    selection.set({
      startSec: Math.min(dragStart, t),
      endSec: Math.max(dragStart, t),
    });
  }
  function onUp(e: PointerEvent) {
    if (dragStart === null) return;
    const t = eventTime(e);
    if (Math.abs(t - dragStart) < 0.005) selection.set(null); // 单击视为清除
    dragStart = null;
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

  $: if (canvas && ($fileA || $fileB || $selection !== undefined || $offsetMs !== undefined)) draw();
</script>

<div class="waveform" bind:this={container}>
  <canvas
    bind:this={canvas}
    on:pointerdown={onDown}
    on:pointermove={onMove}
    on:pointerup={onUp}
    style:touch-action="none"
  ></canvas>
  <div class="legend">
    <span class="sw a"></span>A
    <span class="sw b"></span>B（已按 {$offsetMs.toFixed(0)} ms 偏移显示）
    {#if $selection}<button class="clear" on:click={() => selection.set(null)}>清除选区</button>{/if}
  </div>
</div>

<style>
  .waveform { position: relative; }
  canvas { display: block; width: 100%; border-radius: 8px; cursor: crosshair; }
  .legend {
    display: flex; align-items: center; gap: 8px;
    margin-top: 6px; font-size: 12px; color: #94a3b8;
  }
  .sw { width: 12px; height: 3px; border-radius: 2px; display: inline-block; }
  .sw.a { background: #22d3ee; }
  .sw.b { background: #fb923c; }
  .clear {
    margin-left: auto; background: none; border: 1px solid #475569;
    color: #94a3b8; border-radius: 4px; font-size: 11px; padding: 2px 8px; cursor: pointer;
  }
  .clear:hover { border-color: #94a3b8; color: #e2e8f0; }
</style>
