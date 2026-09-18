<script lang="ts">
  import {
    app,
    setWindow,
    setFftSize,
    setBand,
    setOffset,
    setSelection,
    cancelAnalysis,
    autoOffset,
  } from '../state/app.svelte';
  import { FFT_SIZES, type WindowType } from '../types';

  const WINDOWS: Array<{ id: WindowType; label: string }> = [
    { id: 'hann', label: 'Hann' },
    { id: 'hamming', label: 'Hamming' },
    { id: 'blackman', label: 'Blackman' },
    { id: 'rect', label: '矩形' },
  ];

  function num(e: Event): number {
    return parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
  }

  function setSelStart(e: Event) {
    const end = app.selection?.end ?? num(e) + 1;
    setSelection({ start: num(e), end: Math.max(end, num(e) + 0.001) });
  }
  function setSelEnd(e: Event) {
    const start = app.selection?.start ?? 0;
    setSelection({ start, end: Math.max(num(e), start + 0.001) });
  }
</script>

<div class="bar">
  <fieldset>
    <legend>窗函数</legend>
    <select value={app.window} onchange={(e) => setWindow(e.currentTarget.value as WindowType)}>
      {#each WINDOWS as w}
        <option value={w.id} selected={app.window === w.id}>{w.label}</option>
      {/each}
    </select>
  </fieldset>

  <fieldset>
    <legend>FFT 尺寸</legend>
    <select value={app.fftSize} onchange={(e) => setFftSize(parseInt(e.currentTarget.value))}>
      {#each FFT_SIZES as n}
        <option value={n} selected={app.fftSize === n}>{n}</option>
      {/each}
    </select>
  </fieldset>

  <fieldset>
    <legend>比较频段 (Hz)</legend>
    <input
      type="number"
      min="0"
      step="10"
      value={app.band.low}
      onchange={(e) => setBand(num(e), app.band.high)}
    />
    <span>–</span>
    <input
      type="number"
      min="0"
      step="10"
      value={app.band.high}
      onchange={(e) => setBand(app.band.low, num(e))}
    />
  </fieldset>

  <fieldset>
    <legend>选区 (s)</legend>
    <input
      type="number"
      step="0.01"
      value={app.selection?.start.toFixed(3) ?? ''}
      onchange={setSelStart}
      placeholder="起"
    />
    <span>–</span>
    <input
      type="number"
      step="0.01"
      value={app.selection?.end.toFixed(3) ?? ''}
      onchange={setSelEnd}
      placeholder="止"
    />
  </fieldset>

  <fieldset class="offset">
    <legend>B 时间偏移 (s)</legend>
    <div class="nudge">
      <button onclick={() => setOffset(app.offsetSec - 0.1)}>−0.1</button>
      <button onclick={() => setOffset(app.offsetSec - 0.01)}>−0.01</button>
      <button onclick={() => setOffset(app.offsetSec - 0.001)}>−1ms</button>
      <input
        type="number"
        step="0.001"
        value={app.offsetSec.toFixed(3)}
        onchange={(e) => setOffset(num(e))}
      />
      <button onclick={() => setOffset(app.offsetSec + 0.001)}>+1ms</button>
      <button onclick={() => setOffset(app.offsetSec + 0.01)}>+0.01</button>
      <button onclick={() => setOffset(app.offsetSec + 0.1)}>+0.1</button>
    </div>
    <button class="auto" onclick={() => void autoOffset()}>自动估计偏移（互相关）</button>
  </fieldset>

  <fieldset class="status">
    <legend>状态</legend>
    {#if app.analyzing}
      <progress value={app.progress} max="1"></progress>
      <button class="cancel" onclick={cancelAnalysis}>取消分析</button>
    {/if}
    <span class="status-text">{app.status}</span>
  </fieldset>
</div>

<style>
  .bar {
    display: flex;
    gap: 0.8rem;
    flex-wrap: wrap;
    align-items: stretch;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.35rem 0.6rem 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  legend {
    font-size: 0.72rem;
    color: var(--text);
    padding: 0 0.25rem;
  }
  input[type='number'] {
    width: 6.5em;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-h);
    padding: 0.15rem 0.3rem;
    font: inherit;
  }
  select {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-h);
    padding: 0.15rem 0.3rem;
    font: inherit;
  }
  .offset {
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
  }
  .nudge {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  .nudge input {
    width: 6em;
  }
  .auto {
    font-size: 0.8rem;
  }
  .status {
    min-width: 220px;
    flex: 1;
  }
  .status-text {
    font-size: 0.8rem;
    color: var(--text);
  }
  progress {
    width: 120px;
  }
  .cancel {
    border-color: #ef4444;
    color: #ef4444;
  }
</style>
