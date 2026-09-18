<script lang="ts">
  import { fileA, fileB, offsetMs } from '../stores';
  import { requestAlign } from '../analysisController';

  let aligning = false;
  let alignInfo = '';

  async function autoAlign() {
    const a = $fileA;
    const b = $fileB;
    if (!a || !b) return;
    aligning = true;
    alignInfo = '';
    try {
      const { offsetMs: est, confidence } = await requestAlign(a.pcm, b.pcm, a.sampleRate, 2);
      offsetMs.set(Math.round(est * 10) / 10);
      alignInfo = `估计偏移 ${est.toFixed(1)} ms（置信度 ${(confidence * 100).toFixed(0)}%）`;
    } catch (e) {
      alignInfo = `对齐失败：${e}`;
    } finally {
      aligning = false;
    }
  }
</script>

<section class="panel">
  <h3>时间偏移校准</h3>
  <div class="row">
    <input type="range" min="-1000" max="1000" step="1" bind:value={$offsetMs} />
    <div class="num">
      <input type="number" step="0.1" bind:value={$offsetMs} />
      <span>ms</span>
    </div>
  </div>
  <div class="row sub">
    <button on:click={autoAlign} disabled={!$fileA || !$fileB || aligning}>
      {aligning ? '对齐中…' : '自动对齐（GCC-PHAT）'}
    </button>
    <button class="ghost" on:click={() => offsetMs.set(0)}>归零</button>
    <span class="hint">正值 = B 的内容比 A 晚出现；分析时 B 的选区相应平移</span>
  </div>
  {#if alignInfo}<div class="info">{alignInfo}</div>{/if}
</section>

<style>
  .panel { border: 1px solid #2a3550; border-radius: 8px; padding: 12px; background: #141a2b; }
  h3 { margin: 0 0 10px; font-size: 13px; color: #e2e8f0; font-weight: 600; }
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .row.sub { font-size: 12px; }
  input[type='range'] { flex: 1; accent-color: #3b82f6; }
  .num { display: flex; align-items: center; gap: 4px; color: #94a3b8; font-size: 12px; }
  .num input {
    width: 90px; background: #0b1020; border: 1px solid #2a3550; color: #e2e8f0;
    border-radius: 4px; padding: 4px 6px; font-size: 12px;
  }
  button {
    background: #1d4ed8; color: #fff; border: none; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
  button.ghost { background: none; border: 1px solid #475569; color: #94a3b8; }
  .hint { color: #64748b; }
  .info { font-size: 12px; color: #4ade80; }
</style>
