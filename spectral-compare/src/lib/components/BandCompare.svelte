<script lang="ts">
  import { spectra, bandLowHz, bandHighHz, fileA } from '../stores';
  import { DB_FLOOR } from '../audio/dsp';

  $: nyquist = ($fileA?.sampleRate ?? 44100) / 2;
  $: if ($bandHighHz > nyquist) bandHighHz.set(Math.floor(nyquist));
  $: valid = $bandLowHz >= 0 && $bandHighHz > $bandLowHz;

  $: delta =
    $spectra.A && $spectra.B && valid ? $spectra.A.bandEnergyDb - $spectra.B.bandEnergyDb : null;

  function fmt(v: number | undefined): string {
    if (v === undefined) return '—';
    return v <= DB_FLOOR ? `≤ ${DB_FLOOR}（静音）` : v.toFixed(2);
  }
</script>

<section class="panel">
  <h3>频段能量对比</h3>
  <div class="row">
    <label>频段下限 <input type="number" min="0" bind:value={$bandLowHz} /> Hz</label>
    <label>频段上限 <input type="number" min="1" bind:value={$bandHighHz} /> Hz</label>
  </div>
  {#if !valid}<div class="warn">频段无效：需满足 0 ≤ 下限 &lt; 上限 ≤ 奈奎斯特频率</div>{/if}
  <div class="grid">
    <span class="k a">A 频段能量</span><span class="v">{fmt($spectra.A?.bandEnergyDb)} dB</span>
    <span class="k b">B 频段能量</span><span class="v">{fmt($spectra.B?.bandEnergyDb)} dB</span>
    <span class="k">能量差 (A−B)</span>
    <span class="v delta" class:pos={delta !== null && delta > 0} class:neg={delta !== null && delta < 0}>
      {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)} dB`}
    </span>
  </div>
  <div class="note">静音段能量截断于 {DB_FLOOR} dB，不会产生无限大分贝值。</div>
</section>

<style>
  .panel { border: 1px solid #2a3550; border-radius: 8px; padding: 12px; background: #141a2b; }
  h3 { margin: 0 0 10px; font-size: 13px; color: #e2e8f0; font-weight: 600; }
  .row { display: flex; gap: 16px; margin-bottom: 10px; flex-wrap: wrap; }
  label { font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 6px; }
  input {
    width: 90px; background: #0b1020; border: 1px solid #2a3550; color: #e2e8f0;
    border-radius: 4px; padding: 4px 6px; font-size: 12px;
  }
  .warn { color: #fbbf24; font-size: 12px; margin-bottom: 8px; }
  .grid {
    display: grid; grid-template-columns: auto 1fr; gap: 6px 16px;
    font-size: 13px; align-items: baseline;
  }
  .k { color: #94a3b8; }
  .k.a { color: #22d3ee; }
  .k.b { color: #fb923c; }
  .v { font-family: monospace; color: #e2e8f0; }
  .delta.pos { color: #4ade80; }
  .delta.neg { color: #f87171; }
  .note { margin-top: 10px; font-size: 11px; color: #64748b; }
</style>
