<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import FileLoader from './lib/components/FileLoader.svelte';
  import WaveformView from './lib/components/WaveformView.svelte';
  import SpectrumView from './lib/components/SpectrumView.svelte';
  import OffsetControl from './lib/components/OffsetControl.svelte';
  import BandCompare from './lib/components/BandCompare.svelte';
  import SignalGenerator from './lib/components/SignalGenerator.svelte';
  import ExportPanel from './lib/components/ExportPanel.svelte';
  import {
    selection, windowFn, fftSize, bandLowHz, bandHighHz, offsetMs,
    fileA, fileB, resampleNotice, planId, planName, progress, spectra,
  } from './lib/stores';
  import { WINDOW_LABELS } from './lib/audio/windows';
  import { initAnalysisController, cancelAnalysis } from './lib/analysisController';
  import { savePlan, loadPlan, listPlans, deletePlan, saveLastPlanId, loadLastPlanId } from './lib/db';
  import type { AnalysisPlan, WindowType } from './lib/types';

  const WINDOW_TYPES: WindowType[] = ['hann', 'hamming', 'blackman', 'rectangular'];
  const FFT_SIZES = [1024, 2048, 4096, 8192, 16384, 32768];

  let savedPlans: AnalysisPlan[] = [];
  let restoring = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function currentPlan(): AnalysisPlan {
    return {
      id: get(planId),
      name: get(planName),
      fileAName: get(fileA)?.name ?? null,
      fileBName: get(fileB)?.name ?? null,
      selection: get(selection),
      windowFn: get(windowFn),
      fftSize: get(fftSize),
      bandLowHz: get(bandLowHz),
      bandHighHz: get(bandHighHz),
      offsetMs: get(offsetMs),
      updatedAt: Date.now(),
    };
  }

  /** 分析方案（含选区标记位置）写入 IndexedDB，刷新后可恢复 */
  function scheduleSave() {
    if (restoring || !get(planId)) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const plan = currentPlan();
      await savePlan(plan);
      await saveLastPlanId(plan.id);
      savedPlans = (await listPlans()).sort((a, b) => b.updatedAt - a.updatedAt);
    }, 500);
  }

  function applyPlan(plan: AnalysisPlan) {
    restoring = true;
    planId.set(plan.id);
    planName.set(plan.name);
    selection.set(plan.selection);
    windowFn.set(plan.windowFn);
    fftSize.set(plan.fftSize);
    bandLowHz.set(plan.bandLowHz);
    bandHighHz.set(plan.bandHighHz);
    offsetMs.set(plan.offsetMs);
    restoring = false;
  }

  async function newPlan() {
    const plan: AnalysisPlan = {
      id: crypto.randomUUID(),
      name: `方案 ${new Date().toLocaleString()}`,
      fileAName: null,
      fileBName: null,
      selection: null,
      windowFn: 'hann',
      fftSize: 4096,
      bandLowHz: 200,
      bandHighHz: 2000,
      offsetMs: 0,
      updatedAt: Date.now(),
    };
    applyPlan(plan);
    scheduleSave();
  }

  async function openPlan(id: string) {
    const plan = await loadPlan(id);
    if (plan) {
      applyPlan(plan);
      await saveLastPlanId(plan.id);
    }
  }

  async function removePlan() {
    const id = get(planId);
    if (!id) return;
    await deletePlan(id);
    savedPlans = (await listPlans()).sort((a, b) => b.updatedAt - a.updatedAt);
    await newPlan();
  }

  onMount(() => {
    const dispose = initAnalysisController();

    // 参数或选区变化 → 自动保存方案（标记位置刷新后恢复）
    const unsubs = [
      selection.subscribe(scheduleSave),
      windowFn.subscribe(scheduleSave),
      fftSize.subscribe(scheduleSave),
      bandLowHz.subscribe(scheduleSave),
      bandHighHz.subscribe(scheduleSave),
      offsetMs.subscribe(scheduleSave),
      planName.subscribe(scheduleSave),
      fileA.subscribe(scheduleSave),
      fileB.subscribe(scheduleSave),
    ];

    (async () => {
      savedPlans = (await listPlans()).sort((a, b) => b.updatedAt - a.updatedAt);
      const lastId = await loadLastPlanId();
      const last = lastId ? await loadPlan(lastId) : undefined;
      if (last) applyPlan(last); // 恢复上次的标记位置
      else await newPlan();
    })();

    return () => {
      dispose();
      for (const u of unsubs) u();
      if (saveTimer) clearTimeout(saveTimer);
    };
  });

  $: busy = $progress.A !== null || $progress.B !== null;
  $: hasResults = !!$spectra.A || !!$spectra.B;
</script>

<main>
  <header>
    <h1>录音频谱比对台</h1>
    <div class="plan-bar">
      <input class="plan-name" bind:value={$planName} aria-label="方案名称" />
      <select value={$planId} on:change={(e) => openPlan(e.currentTarget.value)} aria-label="已保存方案">
        {#each savedPlans as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <button class="ghost" on:click={newPlan}>新建方案</button>
      <button class="ghost danger" on:click={removePlan}>删除方案</button>
      <button class="cancel" on:click={cancelAnalysis} disabled={!busy && !hasResults}>取消分析</button>
    </div>
  </header>

  <p class="privacy">音频仅保留在本地浏览器内存中，分析方案存储于本机 IndexedDB，无任何服务端上传。</p>

  {#if $resampleNotice}
    <div class="notice">{$resampleNotice}</div>
  {/if}

  <FileLoader />

  <div class="params">
    <label>窗函数
      <select bind:value={$windowFn}>
        {#each WINDOW_TYPES as w}
          <option value={w}>{WINDOW_LABELS[w]}</option>
        {/each}
      </select>
    </label>
    <label>FFT 大小
      <select bind:value={$fftSize}>
        {#each FFT_SIZES as n}
          <option value={n}>{n}</option>
        {/each}
      </select>
    </label>
  </div>

  <WaveformView />
  <SpectrumView />

  <div class="cols">
    <OffsetControl />
    <BandCompare />
  </div>

  <SignalGenerator />
  <ExportPanel />
</main>

<style>
  main {
    max-width: 1080px; margin: 0 auto; padding: 20px 16px 60px;
    display: flex; flex-direction: column; gap: 14px;
  }
  header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 18px; color: #f1f5f9; margin: 0; }
  .plan-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .plan-name {
    background: #0b1020; border: 1px solid #2a3550; color: #e2e8f0;
    border-radius: 6px; padding: 6px 10px; font-size: 13px; width: 180px;
  }
  select {
    background: #0b1020; border: 1px solid #2a3550; color: #e2e8f0;
    border-radius: 6px; padding: 6px; font-size: 12px; max-width: 200px;
  }
  button {
    background: #1d4ed8; color: #fff; border: none; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  button.ghost { background: none; border: 1px solid #475569; color: #94a3b8; }
  button.ghost.danger:hover { border-color: #f87171; color: #f87171; }
  button.cancel { background: #7f1d1d; }
  button.cancel:disabled { opacity: 0.4; cursor: default; }
  .privacy { font-size: 12px; color: #64748b; margin: 0; }
  .notice {
    background: #422006; border: 1px solid #a16207; color: #fde68a;
    border-radius: 8px; padding: 8px 12px; font-size: 13px;
  }
  .params { display: flex; gap: 20px; }
  .params label {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: #94a3b8;
  }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 800px) {
    .cols { grid-template-columns: 1fr; }
  }
</style>
