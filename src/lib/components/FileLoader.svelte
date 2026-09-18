<script lang="ts">
  import { app, loadFile, loadSample, clearSlot } from '../state/app.svelte';
  import type { SlotId } from '../types';

  let { slot }: { slot: SlotId } = $props();

  const info = $derived(app.slots[slot]);
  const base = import.meta.env.BASE_URL;
  const sampleUrl = $derived(`${base}samples/sample-${slot.toLowerCase()}.wav`);
  const sampleName = $derived(`sample-${slot.toLowerCase()}.wav`);

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (f) await loadFile(slot, f);
    input.value = '';
  }
</script>

<div class="card">
  <div class="card-head">
    <strong>录音 {slot}</strong>
    {#if info}
      <button class="link" onclick={() => clearSlot(slot)}>移除</button>
    {/if}
  </div>

  <label class="file-btn">
    选择 WAV 文件
    <input type="file" accept=".wav,audio/wav,audio/x-wav" onchange={onFile} />
  </label>
  <div class="row">
    <button onclick={() => loadSample(slot, sampleUrl, sampleName)}>载入示例 {slot}</button>
    <button onclick={() => loadSample(slot, `${base}samples/verify-1khz.wav`, 'verify-1khz.wav')}>
      1 kHz 校验信号
    </button>
  </div>

  {#if info}
    <dl class="meta">
      <div><dt>文件</dt><dd title={info.name}>{info.name}</dd></div>
      <div><dt>时长</dt><dd>{info.duration.toFixed(3)} s</dd></div>
      <div><dt>采样率</dt><dd>{info.originalSampleRate} Hz</dd></div>
      {#if info.resampled}
        <div class="resample-note">
          <dt>重采样</dt>
          <dd>已显式重采样 {info.originalSampleRate} → {info.sampleRate} Hz（线性插值）</dd>
        </div>
      {/if}
    </dl>
  {:else}
    <p class="dim">未载入。音频仅在本地处理，不会上传。</p>
  {/if}
</div>

<style>
  .card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    flex: 1;
    min-width: 260px;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .file-btn {
    display: inline-block;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--accent-border);
    border-radius: 6px;
    background: var(--accent-bg);
    cursor: pointer;
    margin-bottom: 0.4rem;
  }
  .file-btn input {
    display: none;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .meta {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }
  .meta div {
    display: flex;
    gap: 0.5rem;
  }
  .meta dt {
    color: var(--text);
    min-width: 3.5em;
  }
  .meta dd {
    margin: 0;
    color: var(--text-h);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 22em;
  }
  .resample-note dd {
    color: #f59e0b;
  }
  .dim {
    color: var(--text);
    font-size: 0.85rem;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
  }
</style>
