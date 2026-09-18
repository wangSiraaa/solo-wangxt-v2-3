import type { AnalysisPlan } from './types';

/**
 * IndexedDB 持久化：只保存分析方案（选区、窗函数、频段、偏移等标记信息）。
 * 原始音频不写入数据库、不上传，始终保留在用户本地。
 */

const DB_NAME = 'spectral-compare';
const DB_VERSION = 1;
const PLAN_STORE = 'plans';
const STATE_STORE = 'appState';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PLAN_STORE)) {
        db.createObjectStore(PLAN_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function savePlan(plan: AnalysisPlan): Promise<IDBValidKey> {
  return tx(PLAN_STORE, 'readwrite', (s) => s.put(plan));
}

export function loadPlan(id: string): Promise<AnalysisPlan | undefined> {
  return tx(PLAN_STORE, 'readonly', (s) => s.get(id)) as Promise<AnalysisPlan | undefined>;
}

export function listPlans(): Promise<AnalysisPlan[]> {
  return tx(PLAN_STORE, 'readonly', (s) => s.getAll()) as Promise<AnalysisPlan[]>;
}

export function deletePlan(id: string): Promise<undefined> {
  return tx(PLAN_STORE, 'readwrite', (s) => s.delete(id));
}

export function saveLastPlanId(id: string): Promise<IDBValidKey> {
  return tx(STATE_STORE, 'readwrite', (s) => s.put(id, 'lastPlanId'));
}

export function loadLastPlanId(): Promise<string | undefined> {
  return tx(STATE_STORE, 'readonly', (s) => s.get('lastPlanId')) as Promise<string | undefined>;
}
