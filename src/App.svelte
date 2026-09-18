<script lang="ts">
  import { onMount } from 'svelte';
  import { app, restore } from './lib/state/app.svelte';
  import FileLoader from './lib/components/FileLoader.svelte';
  import WaveformView from './lib/components/WaveformView.svelte';
  import SpectrumView from './lib/components/SpectrumView.svelte';
  import ControlBar from './lib/components/ControlBar.svelte';
  import BandPanel from './lib/components/BandPanel.svelte';
  import MarkerList from './lib/components/MarkerList.svelte';
  import PlaybackBar from './lib/components/PlaybackBar.svelte';
  import ExportPanel from './lib/components/ExportPanel.svelte';

  onMount(() => {
    void restore();
  });
</script>

<main>
  <header>
    <div>
      <h1>录音频谱比对</h1>
      <p class="sub">纯浏览器本地分析 · Web Audio 解码 · FFT 于 Web Worker · 方案存 IndexedDB</p>
    </div>
    <ExportPanel />
  </header>

  {#if app.pendingFiles.length}
    <div class="notice">
      本地方案已恢复，但以下录音未在本地缓存（文件过大或未保存），请重新选择：{app.pendingFiles.join(
        '、',
      )}
    </div>
  {/if}

  <section class="loaders">
    <FileLoader slot="A" />
    <FileLoader slot="B" />
  </section>

  <WaveformView />
  <ControlBar />

  <section class="main-grid">
    <SpectrumView />
    <aside>
      <BandPanel />
      <PlaybackBar />
      <MarkerList />
    </aside>
  </section>
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
    color: var(--text-h);
  }
  .sub {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--text);
  }
  .notice {
    border: 1px solid #f59e0b;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 8px;
    padding: 0.5rem 0.8rem;
    font-size: 0.85rem;
  }
  .loaders {
    display: flex;
    gap: 0.8rem;
    flex-wrap: wrap;
  }
  .main-grid {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 0.8rem;
    align-items: start;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  @media (max-width: 900px) {
    .main-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
