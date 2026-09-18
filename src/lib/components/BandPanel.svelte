<script lang="ts">
  /** 指定频段能量对比：dB 值经 -120 dB 地板处理，静音段显示 -120.0 而非 -∞ */
  import { app } from '../state/app.svelte';
  import { powerToDb, bandEnergy, bandPeakFreq } from '../audio/dsp';
  import type { BandComparison } from '../types';

  const cmp = $derived.by((): BandComparison | null => {
    const { low, high } = app.band;
    if (!app.spectrumA && !app.spectrumB) return null;
    const energyOf = (s: NonNullable<typeof app.spectrumA>) =>
      powerToDb(bandEnergy(s.power, s.sampleRate, s.fftSize, low, high));
    const peakOf = (s: NonNullable<typeof app.spectrumA>) =>
      bandPeakFreq(s.power, s.sampleRate, s.fftSize, low, high);
    const eA = app.spectrumA ? energyOf(app.spectrumA) : null;
    const eB = app.spectrumB ? energyOf(app.spectrumB) : null;
    return {
      energyA: eA ?? NaN,
      energyB: eB ?? NaN,
      delta: eA != null && eB != null ? eA - eB : NaN,
      peakFreqA: app.spectrumA ? peakOf(app.spectrumA) : null,
      peakFreqB: app.spectrumB ? peakOf(app.spectrumB) : null,
    };
  });

  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
  const fmtHz = (v: number | null) => (v != null ? `${v.toFixed(1)} Hz` : '—');
</script>

<div class="panel">
  <h3>频段能量对比 <span class="band">{app.band.low}–{app.band.high} Hz</span></h3>
  {#if cmp}
    <table>
      <tbody>
        <tr>
          <td class="a">A 能量</td>
          <td>{fmt(cmp.energyA)} dB</td>
        </tr>
        <tr>
          <td class="b">B 能量（已按偏移对齐）</td>
          <td>{fmt(cmp.energyB)} dB</td>
        </tr>
        <tr class="delta">
          <td>能量差 A−B</td>
          <td>{fmt(cmp.delta)} dB</td>
        </tr>
        <tr>
          <td class="a">A 频段峰值</td>
          <td>{fmtHz(cmp.peakFreqA)}</td>
        </tr>
        <tr>
          <td class="b">B 频段峰值</td>
          <td>{fmtHz(cmp.peakFreqB)}</td>
        </tr>
      </tbody>
    </table>
  {:else}
    <p class="dim">等待分析结果…</p>
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
  .band {
    color: var(--accent);
    font-weight: normal;
    font-size: 0.8rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  td {
    padding: 0.15rem 0;
  }
  td:last-child {
    text-align: right;
    font-family: ui-monospace, monospace;
    color: var(--text-h);
  }
  .a {
    color: #0ea5e9;
  }
  .b {
    color: #f59e0b;
  }
  .delta td {
    border-top: 1px solid var(--border);
    font-weight: 600;
  }
  .dim {
    color: var(--text);
    font-size: 0.85rem;
  }
</style>
