/**
 * IndexedDB 持久化：分析方案 + 解码后的 PCM（全部留在本机，无服务端）。
 * 音频体积超过阈值时只保存方案，不保存音频。
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { AnalysisPlan, SlotId } from '../types';

const DB_NAME = 'spectra-compare';
const MAX_AUDIO_BYTES = 64 * 1024 * 1024; // 64 MB

export interface StoredAudio {
  name: string;
  sampleRate: number;
  originalSampleRate: number;
  resampled: boolean;
  pcm: Float32Array;
}

let dbp: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('plan');
        d.createObjectStore('audio');
      },
    });
  }
  return dbp;
}

export async function savePlan(plan: AnalysisPlan): Promise<void> {
  await (await db()).put('plan', plan, 'current');
}

export async function loadPlan(): Promise<AnalysisPlan | undefined> {
  return (await db()).get('plan', 'current');
}

export async function saveAudio(slot: SlotId, audio: StoredAudio): Promise<boolean> {
  if (audio.pcm.byteLength > MAX_AUDIO_BYTES) return false;
  await (await db()).put('audio', audio, slot);
  return true;
}

export async function loadAudio(slot: SlotId): Promise<StoredAudio | undefined> {
  return (await db()).get('audio', slot);
}

export async function deleteAudio(slot: SlotId): Promise<void> {
  await (await db()).delete('audio', slot);
}
