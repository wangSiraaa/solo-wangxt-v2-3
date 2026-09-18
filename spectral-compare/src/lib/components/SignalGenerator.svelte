<script lang="ts">
  import { fileA, fileB } from '../stores';
  import {
    generateSampleTone, generateCalibration, generateNoise, generateSilenceTone,
    encodeWav, downloadBlob,
    type GeneratedSignal,
  } from '../audio/signals';

  interface Entry {
    signal: GeneratedSignal;
    url: string;
  }

  let entries: Entry[] = [];

  const generators = [
    { label: '样音 440 Hz', fn: generateSampleTone },
    { label: '校验信号 100/1k/10k Hz', fn: generateCalibration },
    { label: '白噪声', fn: generateNoise },
    { label: '静音-1kHz-静音', fn: generateSilenceTone },
  ];

  function add(fn: () => GeneratedSignal) {
    const signal = fn();
    const url = URL.createObjectURL(encodeWav(signal.pcm, signal.sampleRate));
    entries = [...entries, { signal, url }];
  }

  function loadInto(entry: Entry, which: 'A' | 'B') {
    const s = entry.signal;
    const audio = {
      name: s.name,
      pcm: s.pcm,
      sampleRate: s.sampleRate,
      duration: s.pcm.length / s.sampleRate,
    };
    if (which === 'A') fileA.set(audio);
    else fileB.set(audio);
  }

  function download(entry: Entry) {
    downloadBlob(encodeWav(entry.signal.pcm, entry.signal.sampleRate), entry.signal.name);
  }
</script>

<section class="panel">
  <h3>测试信号（本地合成，可试听 / 下载 / 载入）</h3>
  <div class="gen-row">
    {#each generators as g}
      <button on:click={() => add(g.fn)}>{g.label}</button>
    {/each}
  </div>
  {#each entries as entry (entry.url)}
    <div class="entry">
      <div class="desc">
        <div>{entry.signal.description}</div>
        {#if entry.signal.knownComponents}
          <div class="known">
            已知分量：
            {#each entry.signal.knownComponents as c}
              <span>{c.freqHz} Hz @ {(20 * Math.log10(c.amplitude)).toFixed(1)} dB</span>
            {/each}
          </div>
        {/if}
      </div>
      <audio controls src={entry.url}></audio>
      <div class="ops">
        <button class="ghost" on:click={() => loadInto(entry, 'A')}>载入 A</button>
        <button class="ghost" on:click={() => loadInto(entry, 'B')}>载入 B</button>
        <button class="ghost" on:click={() => download(entry)}>下载 WAV</button>
      </div>
    </div>
  {/each}
</section>

<style>
  .panel { border: 1px solid #2a3550; border-radius: 8px; padding: 12px; background: #141a2b; }
  h3 { margin: 0 0 10px; font-size: 13px; color: #e2e8f0; font-weight: 600; }
  .gen-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  button {
    background: #0e7490; color: #fff; border: none; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  button.ghost { background: none; border: 1px solid #475569; color: #94a3b8; padding: 4px 10px; }
  button.ghost:hover { color: #e2e8f0; border-color: #94a3b8; }
  .entry {
    border-top: 1px solid #1e293b; padding: 8px 0;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .desc { flex: 1 1 220px; font-size: 12px; color: #cbd5e1; }
  .known { color: #64748b; margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap; }
  audio { height: 28px; max-width: 260px; }
  .ops { display: flex; gap: 6px; }
</style>
