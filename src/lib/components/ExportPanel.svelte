<script lang="ts">
  /** 结果导出：JSON（方案+频谱+频段对比）与 CSV（逐 bin dB），纯本地下载 */
  import { app } from '../state/app.svelte';
  import { powerToDb, bandEnergy, bandPeakFreq } from '../audio/dsp';
  import type { SpectrumResult } from '../types';

  function download(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toDbArray(spec: SpectrumResult): number[] {
    return Array.from(spec.power, (p) => Math.round(powerToDb(p) * 100) / 100);
  }

  function bandSummary() {
    const { low, high } = app.band;
    const e = (s: SpectrumResult) => powerToDb(bandEnergy(s.power, s.sampleRate, s.fftSize, low, high));
    const p = (s: SpectrumResult) => bandPeakFreq(s.power, s.sampleRate, s.fftSize, low, high);
    return {
      bandHz: { low, high },
      energyA_dB: app.spectrumA ? e(app.spectrumA) : null,
      energyB_dB: app.spectrumB ? e(app.spectrumB) : null,
      deltaAminusB_dB:
        app.spectrumA && app.spectrumB ? e(app.spectrumA) - e(app.spectrumB) : null,
      peakFreqA_Hz: app.spectrumA ? p(app.spectrumA) : null,
      peakFreqB_Hz: app.spectrumB ? p(app.spectrumB) : null,
    };
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      plan: {
        selection: app.selection,
        markers: app.markers,
        window: app.window,
        fftSize: app.fftSize,
        band: app.band,
        offsetSec: app.offsetSec,
        files: { A: app.slots.A?.name ?? null, B: app.slots.B?.name ?? null },
      },
      comparison: bandSummary(),
      spectra: {
        A: app.spectrumA
          ? {
              sampleRate: app.spectrumA.sampleRate,
              fftSize: app.spectrumA.fftSize,
              frames: app.spectrumA.frames,
              powerDbPerBin: toDbArray(app.spectrumA),
            }
          : null,
        B: app.spectrumB
          ? {
              sampleRate: app.spectrumB.sampleRate,
              fftSize: app.spectrumB.fftSize,
              frames: app.spectrumB.frames,
              powerDbPerBin: toDbArray(app.spectrumB),
            }
          : null,
      },
    };
    download('spectrum-analysis.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportCsv() {
    const spec = app.spectrumA ?? app.spectrumB;
    if (!spec) return;
    const binHz = spec.sampleRate / spec.fftSize;
    const n = spec.power.length;
    const dbA = app.spectrumA ? toDbArray(app.spectrumA) : null;
    const dbB = app.spectrumB ? toDbArray(app.spectrumB) : null;
    const s = bandSummary();
    const lines = [
      `# 频谱比对导出 ${new Date().toISOString()}`,
      `# 窗函数=${app.window} FFT=${app.fftSize} 偏移B=${app.offsetSec}s 频段=${app.band.low}-${app.band.high}Hz`,
      `# A能量=${s.energyA_dB?.toFixed(2) ?? '-'}dB B能量=${s.energyB_dB?.toFixed(2) ?? '-'}dB 差=${s.deltaAminusB_dB?.toFixed(2) ?? '-'}dB`,
      'freq_Hz,A_dB,B_dB,delta_dB',
    ];
    for (let k = 0; k < n; k++) {
      const a = dbA?.[k];
      const b = dbB?.[k];
      const d = a != null && b != null ? Math.round((a - b) * 100) / 100 : '';
      lines.push(`${(k * binHz).toFixed(2)},${a ?? ''},${b ?? ''},${d}`);
    }
    download('spectrum-analysis.csv', lines.join('\n'), 'text/csv');
  }

  const hasResult = $derived(app.spectrumA != null || app.spectrumB != null);
</script>

<div class="export">
  <button disabled={!hasResult} onclick={exportJson}>导出 JSON</button>
  <button disabled={!hasResult} onclick={exportCsv}>导出 CSV</button>
</div>

<style>
  .export {
    display: flex;
    gap: 0.4rem;
  }
</style>
