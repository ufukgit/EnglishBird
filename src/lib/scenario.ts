// Senaryo motoru: seçici + talimat üretimi + oturum sonu analizinin uygulanması.
import turnTpl from '../../content/prompts/turn.md?raw';
import helpTpl from '../../content/prompts/help.md?raw';
import naturalTpl from '../../content/prompts/natural.md?raw';
import analysisTpl from '../../content/prompts/analysis.md?raw';
import levels from '../../content/prompts/levels.json';
import twistsJson from '../../content/twists.json';
import { getPattern, getWord, SPEAKING_SCENARIOS } from './content';
import { allItems, getMeta, setMeta, type ItemState, type Settings } from './db';
import { sessionDay } from './day';
import { chatJson, fill, type ChatMessage } from './llm';
import { ensureItem, newItemState, putItem, recordAttempt } from './srs';
import type { Cefr, ScenarioSkeleton, TwistInfo, TurnNotes } from './types';

const TWISTS = twistsJson as TwistInfo[];
const CEFR: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const baseOf = (id: string) => id.split('-').slice(0, 3).join('-'); // SPK-TRV-017

// ---------------------------------------------------------------------------
// Seçici: günün alanı, seviye, son 14 günde oynanmamış, aynı temel durum en erken 7 gün sonra.

export async function pickScenario(domains: string[], level: Cefr, length: 'quick' | 'deep', exclude: string[] = []): Promise<ScenarioSkeleton> {
  const hist = (await getMeta('scenarioHistory')) ?? [];
  const today = new Date(sessionDay()).getTime();
  const daysAgo = (d: string) => (today - new Date(d).getTime()) / 86400000;
  const playedRecently = new Set(hist.filter((h) => daysAgo(h.day) < 14).map((h) => h.id));
  const baseRecently = new Set(hist.filter((h) => daysAgo(h.day) < 7).map((h) => h.base));
  const li = CEFR.indexOf(level);

  const score = (s: ScenarioSkeleton) => {
    let sc = 0;
    if (domains.includes(s.domain)) sc += 40;
    const d = Math.abs(CEFR.indexOf(s.cefr) - li);
    sc += d === 0 ? 30 : d === 1 ? 12 : -30;
    if (s.length === length) sc += 10;
    if (playedRecently.has(s.id)) sc -= 100;
    if (baseRecently.has(baseOf(s.id))) sc -= 50;
    if (exclude.includes(s.id)) sc -= 1000;
    return sc + Math.random() * 8;
  };
  return [...SPEAKING_SCENARIOS].sort((a, b) => score(b) - score(a))[0];
}

/** İkinci tur: aynı temel durum, farklı olay */
export function secondRound(s: ScenarioSkeleton): ScenarioSkeleton | null {
  const same = SPEAKING_SCENARIOS.filter((x) => baseOf(x.id) === baseOf(s.id) && x.id !== s.id);
  return same.sort((a, b) => Math.abs(CEFR.indexOf(a.cefr) - CEFR.indexOf(s.cefr)) - Math.abs(CEFR.indexOf(b.cefr) - CEFR.indexOf(s.cefr)))[0] ?? null;
}

export async function rememberScenario(s: ScenarioSkeleton, success: boolean) {
  const hist = (await getMeta('scenarioHistory')) ?? [];
  await setMeta('scenarioHistory', [...hist, { id: s.id, base: baseOf(s.id), day: sessionDay(), success }].slice(-300));
}

// ---------------------------------------------------------------------------
// Hedef öğeler: 4. basamaktakiler (5'e aday) önce, sonra bugünün öğeleri.

export async function targetItems(todayIds: string[], max = 5): Promise<string[]> {
  const items = await allItems();
  const ready = items.filter((i) => i.type === 'word' && i.rung === 4).map((i) => i.id);
  const out = [...ready.slice(0, 3), ...todayIds.filter((id) => !ready.includes(id))];
  return [...new Set(out)].slice(0, max);
}

const itemLine = (ids: string[]) =>
  ids
    .map((id) => {
      const w = getWord(id);
      return w ? `${id} = "${w.text}"` : '';
    })
    .filter(Boolean)
    .join('; ');

export function systemPrompt(s: ScenarioSkeleton, level: Cefr, targets: string[], patternId: string) {
  const tw = TWISTS.find((t) => t.type === s.twistType);
  return fill(turnTpl, {
    cefr: level,
    situation: s.situation,
    aiRole: s.aiRole,
    mood: s.persona.mood,
    accent: s.persona.accent,
    userRole: s.userRole,
    goal: s.goal,
    twist: s.twist,
    twistInstruction: tw?.aiInstruction ?? '',
    targetItems: itemLine(targets),
    pattern: getPattern(patternId)?.text ?? '',
    levelRules: (levels as Record<string, string>)[level] ?? '',
  });
}

export const OPENING: ChatMessage = {
  role: 'user',
  content: '(The scene starts now. Say your first line in character. The learner has not spoken yet. Return the JSON format.)',
};

// ---------------------------------------------------------------------------
// Yardım merdiveni ve "Daha doğal"

export async function askHelp(s: ScenarioSkeleton, level: Cefr, helpLevel: number, lastAiLine: string, turkish?: string) {
  const prompt = fill(helpTpl, {
    level: helpLevel,
    situation: s.situation,
    userRole: s.userRole,
    goal: s.goal,
    lastAiLine,
    cefr: level,
    turkishLine: turkish ? `The learner said in Turkish what they want to say: "${turkish}"` : '',
  });
  const r = await chatJson<{ help: string }>([{ role: 'user', content: prompt }], 'content', 200);
  return r.help;
}

export async function askNatural(s: ScenarioSkeleton, level: Cefr, sentence: string) {
  const prompt = fill(naturalTpl, { cefr: level, register: 'everyday', sentence, situation: s.situation });
  return chatJson<{ casual: string; polite: string; why: string }>([{ role: 'user', content: prompt }], 'content', 250);
}

// ---------------------------------------------------------------------------
// Oturum sonu analizi

export interface Correction {
  quote: string;
  better: string;
  whyTr: string;
  kind: string;
  tag?: string;
}

export interface Analysis {
  goalAchieved: boolean;
  corrections: Correction[];
  goodUse?: { quote: string; whyTr: string };
  itemEvidence: { id: string; rung: number }[];
  patternSpontaneous: boolean;
  weakSpotsTr: string[];
}

export interface TurnRecord {
  speaker: 'L' | 'A';
  text: string;
  help: number;
  notes?: TurnNotes;
  durationMs?: number;
}

export async function analyse(s: ScenarioSkeleton, level: Cefr, targets: string[], patternId: string, turns: TurnRecord[]): Promise<Analysis> {
  const transcript = turns
    .map((t) => `${t.speaker}: ${t.text}${t.notes?.errors?.length ? `  [notes: ${JSON.stringify(t.notes.errors)}]` : ''}`)
    .join('\n');
  const prompt = fill(analysisTpl, {
    cefr: level,
    situation: s.situation,
    goal: s.goal,
    twist: s.twist,
    targetItems: itemLine(targets),
    pattern: getPattern(patternId)?.text ?? '',
    helpLevels: turns.filter((t) => t.speaker === 'L').map((t) => t.help).join(', '),
    transcript,
  });
  const a = await chatJson<Analysis>([{ role: 'user', content: prompt }], 'analysis', 900);
  return {
    goalAchieved: !!a.goalAchieved,
    corrections: (a.corrections ?? []).slice(0, 3),
    goodUse: a.goodUse?.quote ? a.goodUse : undefined,
    itemEvidence: a.itemEvidence ?? [],
    patternSpontaneous: !!a.patternSpontaneous,
    weakSpotsTr: a.weakSpotsTr ?? [],
  };
}

/**
 * Analizi kullanıcı durumuna uygular:
 * - hedef öğe kendiliğinden kullanıldıysa "spontaneous" (5. basamak), yönlendirilerek kullanıldıysa "use" (4.)
 * - her düzeltme bir hata kartı olarak tekrar kuyruğuna girer.
 * Dönüş: kendiliğinden kullanılan öğelerin metinleri ve basamak artışı sayısı.
 */
export async function applyAnalysis(a: Analysis, patternId: string): Promise<{ spontaneous: string[]; rungUps: number }> {
  const spontaneous: string[] = [];
  let rungUps = 0;
  for (const ev of a.itemEvidence) {
    if (!getWord(ev.id) || (ev.rung !== 4 && ev.rung !== 5)) continue;
    const it = await ensureItem(ev.id, 'word');
    if (ev.rung === 5) {
      it.spontaneousUses++;
      spontaneous.push(getWord(ev.id)!.text);
      if (recordAttempt(it, { kind: 'spontaneous', correct: true, helped: false })) rungUps++;
    } else if (recordAttempt(it, { kind: 'use', correct: true, helped: false })) rungUps++;
    await putItem(it);
  }
  if (a.patternSpontaneous) {
    const p = await ensureItem(patternId, 'pattern');
    p.spontaneousUses++;
    recordAttempt(p, { kind: 'spontaneous', correct: true, helped: false });
    await putItem(p);
  }
  for (const c of a.corrections) {
    if (!c.quote || !c.better) continue;
    const id = `err-${c.better.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 40)}`;
    const it: ItemState = (await allItems()).find((x) => x.id === id) ?? newItemState(id, 'error');
    it.error = { quote: c.quote, better: c.better, whyTr: c.whyTr, kind: c.kind, tag: c.tag };
    if (!it.card) it.card = null; // ilk gün sonu planlamasında oluşturulur
    await putItem(it);
  }
  return { spontaneous, rungUps };
}

export function levelOf(settings: Settings): Cefr {
  return settings.level;
}
