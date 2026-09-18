<script lang="ts">
  /** 播放控制：Web Audio 本地播放，可只播放当前选区 */
  import { app } from '../state/app.svelte';
  import { playBuffer, stopPlayback } from '../audio/player';
  import type { SlotId } from '../types';

  let playing = $state<string | null>(null);

  async function play(slot: SlotId, selectionOnly: boolean) {
    const buf = app.buffers[slot];
    if (!buf) return;
    playing = `${slot}${selectionOnly ? '·选区' : ''}`;
    // 选区在参考时间轴上；B 需要加上校准偏移
    const shift = slot === 'B' ? app.offsetSec : 0;
    const sel = app.selection;
    const start = selectionOnly && sel ? Math.max(0, sel.start + shift) : 0;
    const end = selectionOnly && sel ? Math.min(buf.duration, sel.end + shift) : buf.duration;
    const dur = await playBuffer(buf, start, end);
    setTimeout(() => {
      if (playing) playing = null;
    }, dur * 1000);
  }

  function stop() {
    stopPlayback();
    playing = null;
  }
</script>

<div class="panel">
  <h3>播放</h3>
  <div class="row">
    <button disabled={!app.buffers.A} onclick={() => void play('A', false)}>▶ A</button>
    <button disabled={!app.buffers.B} onclick={() => void play('B', false)}>▶ B</button>
    <button disabled={!app.buffers.A || !app.selection} onclick={() => void play('A', true)}>
      ▶ A 选区
    </button>
    <button disabled={!app.buffers.B || !app.selection} onclick={() => void play('B', true)}>
      ▶ B 选区
    </button>
    <button disabled={!playing} onclick={stop}>■ 停止</button>
  </div>
  {#if playing}
    <div class="now">正在播放 {playing}</div>
  {/if}
</div>

<style>
  .panel {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .now {
    font-size: 0.8rem;
    color: var(--accent);
    margin-top: 0.3rem;
  }
</style>
