// Söylenen cümlede hedef öğenin geçip geçmediğini kontrol eder.
// Ses tanıma metnine dayanır; çekim ekleri ve yaygın düzensiz fiiller tolere edilir.

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'can not'],
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/n't\b/g, ' not'],
  [/'m\b/g, ' am'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'d\b/g, ' would'],
  [/\b(it|that|there|what|who|where|here|he|she)'s\b/g, '$1 is'],
  [/'s\b/g, ''],
];

const IRREGULAR: Record<string, string> = {
  ran: 'run', hung: 'hang', threw: 'throw', thrown: 'throw', got: 'get', gotten: 'get', made: 'make', did: 'do', done: 'do',
  lent: 'lend', took: 'take', taken: 'take', went: 'go', gone: 'go', came: 'come', gave: 'give', given: 'give',
  left: 'leave', kept: 'keep', caught: 'catch', brought: 'bring', bought: 'buy', felt: 'feel', told: 'tell',
  said: 'say', thought: 'think', broke: 'break', sold: 'sell', paid: 'pay', spent: 'spend', found: 'find',
  ate: 'eat', eaten: 'eat', drove: 'drive', driven: 'drive', rode: 'ride', wrote: 'write', forgot: 'forget',
  lost: 'lose', met: 'meet', sent: 'send', stood: 'stand', understood: 'understand', woke: 'wake', wore: 'wear',
  won: 'win', sat: 'sit', slept: 'sleep', held: 'hold', meant: 'mean', fell: 'fall', heard: 'hear', saw: 'see',
  seen: 'see', knew: 'know', known: 'know', was: 'be', were: 'be', been: 'be', is: 'be', are: 'be', am: 'be',
  had: 'have', has: 'have', children: 'child', people: 'person', better: 'good',
};

// Hedefte geçse bile zorunlu tutulmayan kelimeler
const OPTIONAL = new Set([
  'a', 'an', 'the', 'it', 'be', 'i', 'you', 'we', 'they', 'he', 'she', 'my', 'your', 'our', 'someone', 'somebody',
  'something', 'myself', 'yourself', 'to',
]);

export function normalize(s: string): string[] {
  let t = s.toLowerCase().replace(/[’‘`]/g, "'").replace(/…/g, ' ');
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

export function stem(w: string): string {
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length > 5 && w.endsWith('ing')) return trimDouble(w.slice(0, -3));
  if (w.length > 4 && w.endsWith('ied')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ed')) return trimDouble(w.slice(0, -2));
  if (w.length > 4 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function trimDouble(w: string) {
  return /([bdgklmnprt])\1$/.test(w) ? w.slice(0, -1) : w;
}

function same(a: string, b: string) {
  const sa = stem(a), sb = stem(b);
  if (sa === sb) return true;
  // "arrive" ↔ "arriv(ed)" gibi e düşmesi
  if (sa.length >= 4 && sb.length >= 4 && (sa + 'e' === sb || sb + 'e' === sa)) return true;
  return false;
}

/** Hedefin zorunlu kelimeleri */
export function keyTokens(target: string): string[] {
  const toks = normalize(target);
  const key = toks.filter((t) => !OPTIONAL.has(stem(t)));
  return key.length ? key : toks;
}

export interface MatchResult {
  ok: boolean;
  missing: string[];
}

/** Hedef öğenin zorunlu kelimeleri söylenenin içinde (sırayla) geçiyor mu */
export function containsTarget(heard: string, target: string): MatchResult {
  const h = normalize(heard);
  const missing: string[] = [];
  let from = 0;
  for (const k of keyTokens(target)) {
    const idx = h.findIndex((w, i) => i >= from && same(w, k));
    if (idx === -1) missing.push(k);
    else from = idx + 1;
  }
  return { ok: missing.length === 0, missing };
}

/** Kelime kelime karşılaştırma (dikte ve model cevap gösterimi için) */
export function wordDiff(heard: string, model: string): { word: string; ok: boolean }[] {
  const h = normalize(heard);
  return model
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const n = normalize(word);
      return { word, ok: n.length === 0 || n.every((t) => h.some((x) => same(x, t))) };
    });
}
