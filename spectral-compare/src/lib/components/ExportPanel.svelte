<script lang="ts">
  import { get } from 'svelte/store';
  import {
    spectra, selection, windowFn, fftSize, bandLowHz, bandHighHz, offsetMs, fileA, fileB, planName,
  } from '../stores';
  import { DB_FLOOR } from '../audio/dsp';
  import { downloadBlob } from '../audio/signals';

  function fmtDb(v: number): string {
    return v <= DB_FLOOR ? String(DB_FLOOR) : v.toFixed(2);
  }

  /** 导出逐 bin 频谱对比 CSV */
  function exportCsv() {
    const s = get(spectra);
    if (!s.A && !s.B) return;
    const ref = s.A ?? s.B;
    if (!ref) return;
    const lines = ['freq_hz,A_db,B_db,delta_db'];
    for (let k = 0; k < ref.freqs.length; k++) {
      const a = s.A ? fmtDb(s.A.magnitudesDb[k]) : '';
      const b = s.B ? fmtDb(s.B.magnitudesDb[k]) : '';
      const d = s.A && s.B ? fmtDb(s.A.magnitudesDb[k] - s.B.magnitudesDb[k]) : '';
      lines.push(`${ref.freqs[k].toFixed(2)},${a},${b},${d}`);
    }
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'spectrum-comparison.csv');
  }

  /** 导出完整分析结果 JSON（方案 + 频段能量 + 时间戳） */
  function exportJson() {
    const s = get(spectra);
    const payload = {
      exportedAt: new Date().toISOString(),
      plan: get(planName),
      files: { A: get(fileA)?.name ?? null, B: get(fileB)?.name ?? null },
      selection: get(selection),
      windowFn: get(windowFn),
      fftSize: get(fftSize),
      bandHz: [get(bandLowHz), get(bandHighHz)],
      offsetMs: get(offsetMs),
      bandEnergyDb: {
        A: s.A?.bandEnergyDb ?? null,
        B: s.B?.bandEnergyDb ?? null,
        delta: s.A && s.B ? s.A.bandEnergyDb - s.B.bandEnergyDb : null,
      },
      dbFloor: DB_FLOOR,
      frames: { A: s.A?.frames ?? 0, B: s.B?.frames ?? 0 },
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      'analysis-result.json'
    );
  }

  $: hasResult = !!$spectra.A || !!$spectra.B;
</script>

<section class="panel">
  <h3>结果导出</h3>
  <div class="row">
    <button on:click={exportCsv} disabled={!hasResult}>导出频谱 CSV</button>
    <button on:click={exportJson} disabled={!hasResult}>导出分析 JSON</button>
  </div>
</section>

<style>
  .panel { border: 1px solid #2a3550; border-radius: 8px; padding: 12px; background: #141a2b; }
  h3 { margin: 0 0 10px; font-size: 13px; color: #e2e8f0; font-weight: 600; }
  .row { display: flex; gap: 8px; }
  button {
    background: #166534; color: #fff; border: none; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
</style>
