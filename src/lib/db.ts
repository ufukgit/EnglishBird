// Tüm kullanıcı durumu cihazda, IndexedDB'de tutulur.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Card } from 'ts-fsrs';
import type { Rung } from './types';

export type ExerciseKind =
  | 'recognize' // 1. Tanıdı: dinleyip anlamı seçti
  | 'recall' // 2. Hatırladı: Türkçe durumdan İngilizcesini söyledi
  | 'catch' // 3. Duydu: hızlı konuşmada yakaladı
  | 'use' // 4. Kullandı: yönlendirilmiş cümlede kullandı
  | 'spontaneous' // 5. Kendiliğinden: senaryoda istenmeden kullandı
  | 'blind' // 6. Kalıcı: habersiz testte hatırladı
  | 'review' // tekrar (ısınma)
  | 'pattern-meaning'
  | 'pattern-use';

export interface Attempt {
  at: string; // ISO
  kind: ExerciseKind;
  correct: boolean;
  helped: boolean;
  heard?: string;
}

export interface ItemState {
  id: string;
  type: 'word' | 'pattern';
  rung: Rung;
  card: Card | null; // ilk gün sonunda oluşturulur
  introducedOn: string;
  lastSeen: string;
  spontaneousUses: number;
  attempts: Attempt[]; // son 40
}

export interface SessionRecord {
  id: string;
  day: string;
  kind: 'quick' | 'deep' | 'extra';
  startedAt: string;
  endedAt?: string;
  speakingMs: number;
  newItems: string[];
  reviewed: number;
  recallCorrect: number;
  recallTotal: number;
  rungUps: number;
  scenarioSkipped: boolean;
  helpUsed: number;
  reportLines: string[];
}

export interface Settings {
  micMode: 'hold' | 'tap';
  accent: 'en-US' | 'en-GB' | 'en-AU' | 'en-IN';
  workerUrl: string;
  secret: string;
}

export const DEFAULT_SETTINGS: Settings = { micMode: 'hold', accent: 'en-US', workerUrl: '', secret: '' };

export interface DayPlan {
  day: string;
  dayNumber: number; // kaçıncı gün (1'den)
  newIds: string[];
  introduced: string[];
  patternId: string;
  reducedLoad: boolean; // bekleyen tekrar > 80 → 5 yeni öğe
}

interface MetaMap {
  settings: Settings;
  plan: DayPlan;
  queue: string[]; // müfredattan çekilmiş ama henüz sunulmamış öğeler
  curriculumNext: number; // sıradaki müfredat günü (0'dan)
  dayCount: number;
  doneDays: string[];
}

interface EBSchema extends DBSchema {
  items: { key: string; value: ItemState };
  sessions: { key: string; value: SessionRecord; indexes: { day: string } };
  meta: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<EBSchema>> | null = null;

export function db() {
  dbp ??= openDB<EBSchema>('englishbird', 1, {
    upgrade(d) {
      d.createObjectStore('items', { keyPath: 'id' });
      const s = d.createObjectStore('sessions', { keyPath: 'id' });
      s.createIndex('day', 'day');
      d.createObjectStore('meta');
    },
  });
  return dbp;
}

export async function getMeta<K extends keyof MetaMap>(key: K): Promise<MetaMap[K] | undefined> {
  return (await (await db()).get('meta', key)) as MetaMap[K] | undefined;
}

export async function setMeta<K extends keyof MetaMap>(key: K, value: MetaMap[K]) {
  await (await db()).put('meta', value, key);
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await getMeta('settings')) ?? {}) };
}

export const getItem = async (id: string) => (await db()).get('items', id);
export const allItems = async () => (await db()).getAll('items');
export const putItem = async (item: ItemState) => (await db()).put('items', item);
export const putSession = async (s: SessionRecord) => (await db()).put('sessions', s);
export const allSessions = async () => (await db()).getAll('sessions');

// ---------- Yedek ----------

export async function exportAll() {
  const d = await db();
  const metaKeys = await d.getAllKeys('meta');
  const meta: Record<string, unknown> = {};
  for (const k of metaKeys) meta[String(k)] = await d.get('meta', k);
  return {
    app: 'englishbird',
    version: 1,
    exportedAt: new Date().toISOString(),
    items: await d.getAll('items'),
    sessions: await d.getAll('sessions'),
    meta,
  };
}

const reviveCard = (c: Card | null): Card | null =>
  c ? { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined } : null;

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data?.app !== 'englishbird') throw new Error('Bu dosya EnglishBird yedeği değil.');
  const d = await db();
  const tx = d.transaction(['items', 'sessions', 'meta'], 'readwrite');
  await Promise.all([tx.objectStore('items').clear(), tx.objectStore('sessions').clear(), tx.objectStore('meta').clear()]);
  for (const it of data.items) await tx.objectStore('items').put({ ...it, card: reviveCard(it.card) });
  for (const s of data.sessions) await tx.objectStore('sessions').put(s);
  for (const [k, v] of Object.entries(data.meta)) await tx.objectStore('meta').put(v, k);
  await tx.done;
}
