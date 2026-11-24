// Ustalaşma merdiveni + FSRS + günlük plan.
import { createEmptyCard, fsrs, generatorParameters, Rating, type Grade } from 'ts-fsrs';
import { CURRICULUM, getWord } from './content';
import { allItems, getItem, getMeta, putItem, setMeta, type Attempt, type DayPlan, type ExerciseKind, type ItemState } from './db';
import { endOfSessionDay, sessionDay } from './day';
import type { Rung } from './types';

// Günlük kullanım: aynı gün içinde tekrar yok, ilk tekrar en erken ertesi gün.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: false, request_retention: 0.9 }));

/** Hangi egzersiz hangi basamağın kanıtıdır */
const RUNG_OF: Partial<Record<ExerciseKind, Rung>> = {
  recognize: 1,
  recall: 2,
  catch: 3,
  use: 4,
  spontaneous: 5,
  blind: 6,
};

export const NEW_PER_DAY = 10;
export const REDUCED_NEW_PER_DAY = 5;
export const REVIEW_OVERLOAD = 80;

export function newItemState(id: string, type: ItemState['type']): ItemState {
  const today = sessionDay();
  return { id, type, rung: 0, card: null, introducedOn: today, lastSeen: today, spontaneousUses: 0, attempts: [] };
}

/**
 * Bir denemeyi kaydeder. Basamak yalnızca sırayla çıkılır: doğru cevap, bir sonraki basamağın
 * kanıt türündeyse basamak artar. Aynı egzersizi tekrarlamak basamak atlatmaz.
 * Dönüş: basamak arttıysa true.
 */
export function recordAttempt(item: ItemState, a: Omit<Attempt, 'at'>): boolean {
  item.attempts = [...item.attempts, { ...a, at: new Date().toISOString() }].slice(-40);
  item.lastSeen = sessionDay();
  const target = RUNG_OF[a.kind];
  if (a.correct && !a.helped && target !== undefined && item.rung === target - 1) {
    item.rung = target;
    return true;
  }
  return false;
}

/** Tekrar sonucu: FSRS günceller; unutulduysa bir basamak geri iner. */
export function applyReview(item: ItemState, correct: boolean, helped: boolean) {
  const grade: Grade = !correct ? Rating.Again : helped ? Rating.Hard : Rating.Good;
  const now = new Date();
  item.card = scheduler.next(item.card ?? createEmptyCard(now), now, grade).card;
  if (!correct && item.rung > 0 && item.rung < 6) item.rung = (item.rung - 1) as Rung;
}

/** Yeni öğenin ilk günü bittiğinde: kendi başına hatırladıysa Good, yoksa Again (ertesi gün tekrar). */
export function scheduleFirstDay(item: ItemState, recalledAlone: boolean) {
  const now = new Date();
  item.card = scheduler.next(createEmptyCard(now), now, recalledAlone ? Rating.Good : Rating.Again).card;
}

export async function dueItems(): Promise<ItemState[]> {
  const limit = endOfSessionDay().getTime();
  const today = sessionDay();
  return (await allItems())
    .filter((i) => i.card && new Date(i.card.due).getTime() <= limit && i.introducedOn !== today)
    .sort((a, b) => new Date(a.card!.due).getTime() - new Date(b.card!.due).getTime());
}

/** Yarının sonuna kadar vadesi gelecek öğe sayısı (bugün tanıtılanlar dahil) */
export async function dueTomorrowCount(): Promise<number> {
  const limit = endOfSessionDay().getTime() + 24 * 3600_000;
  return (await allItems()).filter((i) => i.card && new Date(i.card.due).getTime() <= limit).length;
}

/** En yakın gelecek tekrar tarihi */
export async function nextDueDate(): Promise<Date | null> {
  const dues = (await allItems()).filter((i) => i.card).map((i) => new Date(i.card!.due).getTime());
  return dues.length ? new Date(Math.min(...dues)) : null;
}

/** Bugünün planı: ilk açılışta oluşturulur, gün boyunca sabit kalır. */
export async function getTodayPlan(): Promise<DayPlan> {
  const today = sessionDay();
  const existing = await getMeta('plan');
  if (existing?.day === today) return existing;

  // Önceki günden sunulmamış öğeler kuyruğun başında kalır.
  let queue = (await getMeta('queue')) ?? [];
  if (existing) queue = [...existing.newIds.filter((id) => !existing.introduced.includes(id)), ...queue.filter((id) => !existing.newIds.includes(id))];

  const reducedLoad = (await dueItems()).length > REVIEW_OVERLOAD;
  const quota = reducedLoad ? REDUCED_NEW_PER_DAY : NEW_PER_DAY;
  let next = (await getMeta('curriculumNext')) ?? 0;
  while (queue.length < quota && next < CURRICULUM.length) {
    queue.push(...CURRICULUM[next].items);
    next++;
  }
  const dayCount = ((await getMeta('dayCount')) ?? 0) + 1;
  const plan: DayPlan = {
    day: today,
    dayNumber: dayCount,
    newIds: queue.slice(0, quota),
    introduced: [],
    patternId: CURRICULUM[(dayCount - 1) % CURRICULUM.length].pattern,
    reducedLoad,
  };
  await setMeta('queue', queue.slice(quota));
  await setMeta('curriculumNext', next);
  await setMeta('dayCount', dayCount);
  await setMeta('plan', plan);
  return plan;
}

export async function markIntroduced(ids: string[]) {
  const plan = await getTodayPlan();
  plan.introduced = [...new Set([...plan.introduced, ...ids])];
  await setMeta('plan', plan);
}

export async function markDayDone() {
  const done = (await getMeta('doneDays')) ?? [];
  const today = sessionDay();
  if (!done.includes(today)) await setMeta('doneDays', [...done, today].slice(-400));
}

export async function ensureItem(id: string, type: ItemState['type']) {
  return (await getItem(id)) ?? newItemState(id, type);
}

export { putItem };

export function itemText(id: string) {
  return getWord(id)?.text ?? id;
}

// ---------------------------------------------------------------------------
// Haftalık habersiz test: en az 7 gün önce öğrenilmiş öğeler, önceden haber verilmeden,
// ipucu olmadan sorulur. Sonuç gerçek akılda tutma oranıdır.

const DAY_MS = 86400000;
const ageDays = (day: string) => (new Date(sessionDay()).getTime() - new Date(day).getTime()) / DAY_MS;

export async function blindTestItems(): Promise<ItemState[]> {
  const tests = (await getMeta('blindTests')) ?? [];
  const last = tests[tests.length - 1];
  if (last && ageDays(last.day) < 7) return [];
  if (((await getMeta('dayCount')) ?? 0) < 8) return [];
  const candidates = (await allItems())
    .filter((i) => i.type === 'word' && ageDays(i.introducedOn) >= 7)
    .sort((a, b) => a.introducedOn.localeCompare(b.introducedOn));
  if (candidates.length < 5) return [];
  // En eskiler ve rastgele karışım: yarısı en eski öğelerden
  const oldest = candidates.slice(0, 4);
  const rest = candidates.slice(4).sort(() => Math.random() - 0.5).slice(0, 4);
  return [...oldest, ...rest];
}

/** 30 günden eski öğe habersiz testte doğruysa "Kalıcı" (6. basamak) kanıtı sayılır. */
export function isDurableEvidence(item: ItemState) {
  return ageDays(item.introducedOn) >= 30;
}

export async function saveBlindTest(total: number, correct: number) {
  const tests = (await getMeta('blindTests')) ?? [];
  await setMeta('blindTests', [...tests, { day: sessionDay(), total, correct }].slice(-60));
}
