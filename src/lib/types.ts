// Veri modeli (PLAN.md §3, dokümandaki "Veri modeli" bölümü).

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Skill = 'speaking' | 'listening';

/** Ustalaşma merdiveni: 0 = yeni, 6 = kalıcı */
export type Rung = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const RUNG_NAMES: Record<Rung, string> = {
  0: 'Yeni',
  1: 'Tanıdı',
  2: 'Hatırladı',
  3: 'Duydu',
  4: 'Kullandı',
  5: 'Kendiliğinden kullandı',
  6: 'Kalıcı',
};

export type Domain =
  | 'food'
  | 'shopping'
  | 'transport'
  | 'travel'
  | 'health'
  | 'home'
  | 'services'
  | 'work'
  | 'social'
  | 'phone'
  | 'conflict'
  | 'opinion';

export type TwistType =
  | 'misunderstanding'
  | 'plan-breaks'
  | 'difficult-person'
  | 'your-mistake'
  | 'cultural-trap'
  | 'saying-no'
  | 'topic-drift'
  | 'vague-answer'
  | 'interruption'
  | 'grey-area'
  | 'emotion'
  | 'unexpected-request';

/** Statik içerik: kelime veya öbek */
export interface WordEntry {
  id: string;
  text: string; // "figure out"
  kind: 'word' | 'chunk';
  cefr: Cefr;
  domains: Domain[];
  tr: string; // Türkçe anlam
  ipa?: string;
  examples: string[];
  sayIt: { tr: string; en: string }[]; // "Durumdan söyle" görevleri
  collocations?: string[];
  source: 'ngsl-spoken' | 'ngsl' | 'project';
}

/** Statik içerik: günün kalıbı */
export interface PatternEntry {
  id: string;
  text: string; // "I was wondering if…"
  function: string; // "kibar rica"
  register: 'casual' | 'neutral' | 'formal';
  cefr: Cefr;
  variations: string[]; // 3 varyasyon
  turkishMistake: { wrong: string; right: string; why: string };
  situations: string[]; // kalıbı gerektiren 3 durum
  miniScene: { speaker: string; line: string }[];
}

/** Statik içerik: senaryo iskeleti (diyalog metni yok; her oynanışta AI üretir) */
export interface ScenarioSkeleton {
  id: string; // "SPK-TRV-017-B1-c"
  modality: Skill;
  domain: Domain;
  situation: string;
  userRole: string;
  aiRole: string;
  goal: string;
  twist: string;
  twistType: TwistType;
  cefr: Cefr;
  functions: string[];
  persona: { speed: 'slow' | 'normal' | 'fast'; mood: string; accent: 'en-US' | 'en-GB' | 'en-AU' | 'en-IN' };
  length: 'quick' | 'deep';
  /** dinleme için: anons, sesli mesaj, kulak misafiri, talimat, toplantı, telefon menüsü, hikâye, tartışma */
  listeningFormat?: string;
}

/** Kullanıcı durumu: kelime/kalıp/hata öğesi */
export interface LexicalItem {
  id: string; // içerik id'si veya "err-…"
  type: 'word' | 'pattern' | 'error';
  text: string;
  rung: Rung;
  fsrs: unknown; // ts-fsrs Card
  introducedOn: string; // YYYY-MM-DD
  lastSeen?: string;
  spontaneousUses: number;
  evidence: { rung: Rung; at: string; sessionId: string }[];
}

export interface Session {
  id: string;
  date: string;
  kind: 'quick' | 'deep' | 'extra';
  scenarioId?: string;
  startedAt: string;
  endedAt?: string;
  speakingSeconds: number;
  taskSuccess?: boolean;
  skippedScenario: boolean;
}

export interface Turn {
  sessionId: string;
  index: number;
  speaker: 'user' | 'ai';
  text: string;
  recognitionConfidence?: number;
  durationMs?: number;
  pausesMs?: number[];
  helpLevel: 0 | 1 | 2 | 3 | 4; // 0 = yardımsız
  hiddenNotes?: TurnNotes;
}

/** LLM'in her turda döndürdüğü, kullanıcıya o an gösterilmeyen notlar */
export interface TurnNotes {
  errors: { quote: string; fix: string; kind: 'meaning' | 'naturalness' | 'grammar' | 'sound'; tag?: string }[];
  targetWordsUsed: { id: string; prompted: boolean }[];
  patternUsed: boolean;
  goalProgress: number; // 0–1
  goodUse?: string;
}

export interface SkillLevel {
  skill: Skill;
  band: Cefr;
  sub: 1 | 2 | 3;
  canDoEvidence: { item: string; at: string }[];
}

export interface MetricSnapshot {
  date: string;
  speakingSeconds: number;
  wpm?: number;
  avgPauseMs?: number;
  longPauses: number;
  helpRate: number;
  usableWords: number;
  durableWords: number;
  soundConfusions: Record<string, number>; // "think→sink": 3
}
