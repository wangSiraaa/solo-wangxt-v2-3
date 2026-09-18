<script lang="ts">
  /**
   * 波形视图：A/B 双泳道，共享同一时间轴（B 按校准偏移平移显示）。
   * 拖拽 = 设置选区（与频谱图共享），双击 = 添加标记。
   */
  import { app, setSelection, addMarker } from '../state/app.svelte';

  const HEIGHT = 260;
  const LANE = HEIGHT / 2;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wrap = $state<HTMLDivElement | null>(null);
  let width = $state(800);
  let dragging = $state(false);

  const tMin = $derived(
    Math.min(0, app.slots.B ? -app.offsetSec : 0, app.selection?.start ?? 0),
  );
  const tMax = $derived(
    Math.max(
      0.1,
      app.slots.A?.duration ?? 0,
      app.slots.B ? app.slots.B.duration - app.offsetSec : 0,
      app.selection?.end ?? 0,
      app.markers.length ? Math.max(...app.markers.map((m) => m.time)) : 0,
    ),
  );

  const timeToX = (t: number) => ((t - tMin) / (tMax - tMin)) * width;
  const xToTime = (x: number) => tMin + (x / width) * (tMax - tMin);

  function niceStep(range: number, target = 8): number {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  }

  function drawLane(
    ctx: CanvasRenderingContext2D,
    pcm: Float32Array,
    fs: number,
    y0: number,
    h: number,
    color: string,
    shift: number,
  ) {
    const mid = y0 + h / 2;
    const amp = h / 2 - 6;
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    ctx.fillStyle = color;
    const span = tMax - tMin;
    for (let x = 0; x < width; x++) {
      // 该像素对应的参考时间 → 该泳道信号内的采样区间
      const t0 = tMin + (x / width) * span - shift;
      const t1 = tMin + ((x + 1) / width) * span - shift;
      const i0 = Math.max(0, Math.floor(t0 * fs));
      const i1 = Math.min(pcm.length, Math.ceil(t1 * fs));
      if (i1 <= i0) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = i0; i < i1; i++) {
        const v = pcm[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      ctx.fillRect(x, mid - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
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

    // 泳道背景与标签
    ctx.fillStyle = 'rgba(128,128,128,0.06)';
    ctx.fillRect(0, LANE, width, LANE);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillText('A', 6, 14);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`B（偏移 ${app.offsetSec >= 0 ? '+' : ''}${app.offsetSec.toFixed(3)} s）`, 6, LANE + 14);

    if (app.slots.A) drawLane(ctx, app.slots.A.pcm, app.slots.A.sampleRate, 0, LANE, '#0ea5e9', 0);
    if (app.slots.B)
      drawLane(ctx, app.slots.B.pcm, app.slots.B.sampleRate, LANE, LANE, '#f59e0b', -app.offsetSec);

    // 选区（与频谱共享）
    const sel = app.selection;
    if (sel) {
      const x0 = timeToX(sel.start);
      const x1 = timeToX(sel.end);
      ctx.fillStyle = 'rgba(170, 59, 255, 0.15)';
      ctx.fillRect(x0, 0, x1 - x0, HEIGHT);
      ctx.strokeStyle = 'rgba(170, 59, 255, 0.7)';
      ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, HEIGHT - 1);
    }

    // 标记
    for (const m of app.markers) {
      const x = timeToX(m.time);
      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.fillText(m.label, x + 3, 12);
    }

    // 时间轴
    const step = niceStep(tMax - tMin);
    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.strokeStyle = 'rgba(128,128,128,0.3)';
    for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) {
      const x = timeToX(t);
      ctx.beginPath();
      ctx.moveTo(x, HEIGHT - 14);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
      ctx.fillText(`${t.toFixed(step < 1 ? 1 : 0)}s`, x + 2, HEIGHT - 3);
    }
  }

  function eventTime(e: PointerEvent | MouseEvent): number {
    const rect = canvas!.getBoundingClientRect();
    return xToTime(e.clientX - rect.left);
  }

  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let moved = false;
  let dragStart = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    canvas!.setPointerCapture(e.pointerId);
    dragStart = eventTime(e);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const t = eventTime(e);
    // 超过一个像素宽度才算拖拽，此前不改变选区
    if (!moved && Math.abs(t - dragStart) <= (tMax - tMin) / width) return;
    moved = true;
    setSelection({ start: Math.min(dragStart, t), end: Math.max(dragStart, t) });
  }
  function onPointerUp() {
    dragging = false;
  }
  function onClick(e: MouseEvent) {
    if (moved) return; // 拖拽结束不视为单击
    if (e.detail === 1) {
      // 延迟清除：若紧接着是双击（添加标记），则取消清除
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => setSelection(null), 250);
    }
  }
  function onDblClick(e: MouseEvent) {
    if (clickTimer) clearTimeout(clickTimer); // 双击不清除选区
    addMarker(eventTime(e));
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
    // 依赖：slots / selection / markers / offset / width 变化时重绘
    void app.slots.A;
    void app.slots.B;
    void app.selection;
    void app.markers;
    void app.offsetSec;
    void width;
    draw();
  });
</script>

<div class="wrap" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style:width="100%"
    style:height="{HEIGHT}px"
    style:cursor="crosshair"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onclick={onClick}
    ondblclick={onDblClick}
  ></canvas>
  <div class="hint">拖拽设置选区（波形与频谱共享） · 双击添加标记 · 单击空白清除选区</div>
</div>

<style>
  .wrap {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.4rem;
  }
  canvas {
    display: block;
  }
  .hint {
    font-size: 0.75rem;
    color: var(--text);
    margin-top: 0.2rem;
  }
</style>
