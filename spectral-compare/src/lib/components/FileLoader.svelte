<script lang="ts">
  import { get } from 'svelte/store';
  import { fileA, fileB, resampleNotice } from '../stores';
  import { decodeWavFile } from '../audio/decode';
  import { requestResample } from '../analysisController';
  import type { AudioData } from '../types';

  const channels: ('A' | 'B')[] = ['A', 'B'];

  let loadingA = false;
  let loadingB = false;
  let errorA = '';
  let errorB = '';

  /**
   * 采样率不一致时显式重采样：以 A 的采样率为基准，
   * B 在 Worker 中重采样到 A 的采样率，并给出明确提示。
   */
  async function reconcileRates(newly: 'A' | 'B') {
    const a = get(fileA);
    const b = get(fileB);
    resampleNotice.set(null);
    if (!a || !b || a.sampleRate === b.sampleRate) return;
    const target = a.sampleRate;
    const source = b;
    resampleNotice.set(`采样率不一致：正在将 B（${source.sampleRate} Hz）重采样到 ${target} Hz …`);
    try {
      const pcm = await requestResample(source.pcm, source.sampleRate, target);
      fileB.set({
        ...source,
        pcm,
        sampleRate: target,
        duration: pcm.length / target,
        resampledFrom: source.sampleRate,
      });
      resampleNotice.set(`已显式重采样：B ${source.sampleRate} Hz → ${target} Hz（原始文件未改动）`);
    } catch (e) {
      resampleNotice.set(`重采样失败：${e}`);
    }
  }

  async function pick(which: 'A' | 'B', ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const setLoading = which === 'A' ? (v: boolean) => (loadingA = v) : (v: boolean) => (loadingB = v);
    setLoading(true);
    try {
      const audio = await decodeWavFile(file);
      if (which === 'A') { fileA.set(audio); errorA = ''; }
      else { fileB.set(audio); errorB = ''; }
      await reconcileRates(which);
    } catch (e) {
      const msg = `无法解码 ${file.name}（请使用 WAV 文件）`;
      if (which === 'A') errorA = msg; else errorB = msg;
    } finally {
      setLoading(false);
      input.value = '';
    }
  }

  function fmt(audio: AudioData): string {
    const base = `${audio.sampleRate} Hz · ${audio.duration.toFixed(2)} s`;
    return audio.resampledFrom ? `${base} · 自 ${audio.resampledFrom} Hz 重采样` : base;
  }
</script>

<div class="file-loader">
  {#each channels as ch}
    <div class="slot" class:loaded={ch === 'A' ? $fileA : $fileB}>
      <div class="slot-head">
        <span class="badge" class:badge-b={ch === 'B'}>{ch}</span>
        <label class="pick">
          {ch === 'A' ? (loadingA ? '解码中…' : '选择 WAV') : (loadingB ? '解码中…' : '选择 WAV')}
          <input
            type="file"
            accept=".wav,audio/wav,audio/x-wav,audio/*"
            on:change={(e) => pick(ch, e)}
            disabled={ch === 'A' ? loadingA : loadingB}
          />
        </label>
      </div>
      {#if ch === 'A' && $fileA}
        <div class="meta" title={$fileA.name}>{$fileA.name}</div>
        <div class="meta dim">{fmt($fileA)}</div>
      {:else if ch === 'B' && $fileB}
        <div class="meta" title={$fileB.name}>{$fileB.name}</div>
        <div class="meta dim">{fmt($fileB)}</div>
      {:else}
        <div class="meta dim">未加载</div>
      {/if}
      {#if ch === 'A' && errorA}<div class="err">{errorA}</div>{/if}
      {#if ch === 'B' && errorB}<div class="err">{errorB}</div>{/if}
    </div>
  {/each}
</div>

<style>
  .file-loader { display: flex; gap: 12px; }
  .slot {
    flex: 1; border: 1px solid #2a3550; border-radius: 8px;
    padding: 10px 12px; background: #141a2b; min-width: 0;
  }
  .slot.loaded { border-color: #3b82f6; }
  .slot-head { display: flex; align-items: center; gap: 10px; }
  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 6px;
    background: #0e7490; color: #fff; font-weight: 700;
  }
  .badge-b { background: #c2410c; }
  .pick {
    cursor: pointer; color: #7dd3fc; font-size: 13px;
    border: 1px dashed #3b82f6; border-radius: 6px; padding: 4px 10px;
  }
  .pick:hover { background: #1e293b; }
  .pick input { display: none; }
  .meta {
    margin-top: 6px; font-size: 12px; color: #cbd5e1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .dim { color: #64748b; }
  .err { margin-top: 6px; font-size: 12px; color: #f87171; }
</style>
