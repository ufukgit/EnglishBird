// content/src/*.txt → content/*.json
// Kullanım: node content/build.mjs
// Kelime seviyeleri CEFR-J (A1–B2) ve Octanove (C1–C2) listelerinden alınır.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const write = (p, data) => writeFileSync(join(here, p), JSON.stringify(data, null, 1) + '\n');

const DOMAINS = ['food', 'shopping', 'transport', 'travel', 'health', 'home', 'services', 'work', 'social', 'phone', 'conflict', 'opinion'];
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const errors = [];
const warn = [];

// ---------- CEFR sözlüğü ----------
const cefr = new Map();
for (const file of ['sources/cefrj-vocabulary-profile-1.5.csv', 'sources/octanove-vocabulary-profile-c1c2-1.0.csv']) {
  for (const line of read(file).split('\n').slice(1)) {
    const [head, , level] = line.split(',');
    if (!head || !CEFR_ORDER.includes(level)) continue;
    for (const h of head.split('/')) {
      const k = h.trim().toLowerCase();
      const prev = cefr.get(k);
      if (!prev || CEFR_ORDER.indexOf(level) < CEFR_ORDER.indexOf(prev)) cefr.set(k, level);
    }
  }
}

function lookupCefr(text) {
  const t = text.toLowerCase();
  const cands = [t, t.replace(/s$/, ''), t.replace(/es$/, ''), t.replace(/ed$/, ''), t.replace(/d$/, ''), t.replace(/er$/, ''), t.replace(/ier$/, 'y'), t.replace(/ations?$/, 'ate'), t.replace(/ions?$/, 'e')];
  for (const c of cands) if (cefr.has(c)) return cefr.get(c);
  return undefined;
}

const slug = (s) =>
  s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Kelimeler ----------
function buildWords() {
  const out = [];
  const seen = new Set();
  let domain = null;
  read('src/words.txt')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('# ')) return;
      if (line.startsWith('## ')) {
        domain = line.slice(3).trim();
        if (!DOMAINS.includes(domain)) errors.push(`words.txt:${i + 1} bilinmeyen alan ${domain}`);
        return;
      }
      const parts = line.split(' | ').map((s) => s.trim());
      if (parts.length < 4) return errors.push(`words.txt:${i + 1} eksik alan: ${line}`);
      const [text, tr, examples, sayIt, override] = parts;
      const [sayTr, sayEn] = sayIt.split(' => ').map((s) => s.trim());
      if (!sayEn) errors.push(`words.txt:${i + 1} "=>" yok`);
      const kind = /\s/.test(text) ? 'chunk' : 'word';
      let level = override?.startsWith('@') ? override.slice(1) : lookupCefr(text);
      if (!level) {
        level = 'B1';
        warn.push(`${text}: CEFR bulunamadı → B1`);
      }
      if (!CEFR_ORDER.includes(level)) errors.push(`words.txt:${i + 1} geçersiz CEFR ${level}`);
      const id = `w-${slug(text)}`;
      if (seen.has(id)) errors.push(`words.txt:${i + 1} tekrar: ${text}`);
      seen.add(id);
      out.push({
        id,
        text,
        kind,
        cefr: level,
        domains: [domain],
        tr,
        examples: examples.split(' / ').map((s) => s.trim()),
        sayIt: [{ tr: sayTr, en: sayEn }],
        source: override?.startsWith('@') || kind === 'chunk' ? 'project' : 'cefr-j',
      });
    });
  return out;
}

const words = buildWords();
write('words.json', words);

// ---------- Kalıplar ----------
function buildPatterns() {
  const blocks = read('src/patterns.txt').split(/\n(?=@ )/).filter((b) => b.startsWith('@ '));
  const out = [];
  const seen = new Set();
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const [text, fn, register, level] = lines[0].slice(2).split(' | ').map((s) => s.trim());
    const get = (k) => lines.find((l) => l.startsWith(k + ':'))?.slice(k.length + 1).trim();
    const v = get('var'), e = get('err'), sit = get('sit'), scene = get('scene');
    if (!v || !e || !sit || !scene) { errors.push(`kalıp eksik alan: ${text}`); continue; }
    const [wrongRight, why] = e.split(' :: ');
    const [wrong, right] = wrongRight.split(' -> ');
    if (!why || !right) errors.push(`kalıp err biçimi: ${text}`);
    if (!['casual', 'neutral', 'formal'].includes(register)) errors.push(`kalıp ortam: ${text}`);
    if (!CEFR_ORDER.includes(level)) errors.push(`kalıp CEFR: ${text}`);
    const id = `p-${slug(text)}`;
    if (seen.has(id)) errors.push(`kalıp tekrar: ${text}`);
    seen.add(id);
    const variations = v.split(' / ').map((s) => s.trim());
    const situations = sit.split(' / ').map((s) => s.trim());
    if (variations.length !== 3) errors.push(`kalıp varyasyon sayısı ${variations.length}: ${text}`);
    if (situations.length !== 3) errors.push(`kalıp durum sayısı ${situations.length}: ${text}`);
    out.push({
      id, text, function: fn, register, cefr: level, variations,
      turkishMistake: { wrong: wrong.trim(), right: right?.trim(), why: why?.trim() },
      situations,
      miniScene: scene.split(' / ').map((l) => { const m = l.match(/^([AB]):\s*(.*)$/); return { speaker: m?.[1] ?? '?', line: m?.[2] ?? l }; }),
    });
  }
  return out;
}
const patterns = buildPatterns();
write('patterns.json', patterns);
console.log(`kalıp: ${patterns.length}`, Object.fromEntries(CEFR_ORDER.map((l) => [l, patterns.filter((p) => p.cefr === l).length])));

// ---------- Senaryolar ----------
const TWISTS = ['misunderstanding', 'plan-breaks', 'difficult-person', 'your-mistake', 'cultural-trap', 'saying-no', 'topic-drift', 'vague-answer', 'interruption', 'grey-area', 'emotion', 'unexpected-request', 'none'];
const DOMAIN_CODE = { food: 'FOD', shopping: 'SHP', transport: 'TRN', travel: 'TRV', health: 'HLT', home: 'HOM', services: 'SRV', work: 'WRK', social: 'SOC', phone: 'PHN', conflict: 'CNF', opinion: 'OPN' };
function buildScenarios(file, modality) {
  const out = [];
  let domain = null, base = null, baseNo = 0, variant = 0;
  read(file).split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const at = `${file}:${i + 1}`;
    if (!line || line.startsWith('# ')) return;
    if (line.startsWith('## ')) { domain = line.slice(3).trim(); baseNo = 0; if (!DOMAINS.includes(domain)) errors.push(`${at} alan ${domain}`); return; }
    if (line.startsWith('= ')) {
      const [situation, userRole, aiRole, goal, functions] = line.slice(2).split(' | ').map((s) => s.trim());
      if (!functions) errors.push(`${at} temel durum eksik`);
      base = { situation, userRole, aiRole, goal, functions: functions.split(',').map((s) => s.trim()) };
      baseNo++; variant = 0;
      return;
    }
    if (line.startsWith('- ')) {
      const [twistType, level, length, twist, speed, mood, accent] = line.slice(2).split(' | ').map((s) => s.trim());
      if (!TWISTS.includes(twistType)) errors.push(`${at} olay türü ${twistType}`);
      if (!CEFR_ORDER.includes(level)) errors.push(`${at} CEFR ${level}`);
      if (!['quick', 'deep'].includes(length)) errors.push(`${at} uzunluk ${length}`);
      if (!['slow', 'normal', 'fast'].includes(speed)) errors.push(`${at} hız ${speed}`);
      if (!['en-US', 'en-GB', 'en-AU', 'en-IN'].includes(accent)) errors.push(`${at} aksan ${accent}`);
      const v = String.fromCharCode(97 + variant++);
      const id = `${modality === 'speaking' ? 'SPK' : 'LST'}-${DOMAIN_CODE[domain]}-${String(baseNo).padStart(3, '0')}-${level}-${v}`;
      out.push({ id, modality, domain, ...base, twist, twistType, cefr: level, persona: { speed, mood, accent }, length });
      return;
    }
    errors.push(`${at} tanınmayan satır`);
  });
  return out;
}
const speaking = buildScenarios('src/scenarios.speaking.txt', 'speaking');
write('scenarios.speaking.json', speaking);
console.log(`konuşma senaryosu: ${speaking.length}`, Object.fromEntries(CEFR_ORDER.map((l) => [l, speaking.filter((s) => s.cefr === l).length])));
console.log('  olay:', Object.fromEntries(TWISTS.map((t) => [t, speaking.filter((s) => s.twistType === t).length])));

// ---------- Varsayılan müfredat: 30 gün × 10 öğe + 1 kalıp ----------
// Alanlar sırayla döner; her alanın öğeleri kolaydan zora 10'arlı paketlere bölünür.
// Çalışma anında seçici bu sırayı zayıf yönlere göre değiştirebilir.
function buildCurriculum() {
  const sorted = (d) => words.filter((w) => w.domains[0] === d).sort((a, b) => CEFR_ORDER.indexOf(a.cefr) - CEFR_ORDER.indexOf(b.cefr));
  const packs = [[], [], []];
  for (const d of DOMAINS) {
    const q = sorted(d);
    packs[0].push({ domains: [d], items: q.slice(0, 10) });
    packs[1].push({ domains: [d], items: q.slice(10, 20) });
    packs[2].push({ domains: [d], items: q.slice(20) });
  }
  // Üçüncü turdaki 5'erlik paketler ikişer ikişer birleştirilir.
  const merged = [];
  for (let i = 0; i < packs[2].length; i += 2) {
    const a = packs[2][i], b = packs[2][i + 1];
    merged.push(b ? { domains: [...a.domains, ...b.domains], items: [...a.items, ...b.items] } : a);
  }
  const pats = [...patterns].sort((a, b) => CEFR_ORDER.indexOf(a.cefr) - CEFR_ORDER.indexOf(b.cefr));
  return [...packs[0], ...packs[1], ...merged].map((p, i) => ({
    day: i + 1,
    domains: p.domains,
    items: p.items.map((w) => w.id),
    pattern: pats[i % pats.length].id,
  }));
}
const curriculum = buildCurriculum();
write('curriculum.json', curriculum);
console.log(`müfredat: ${curriculum.length} gün, ${curriculum.reduce((n, d) => n + d.items.length, 0)} öğe`);

// ---------- Rapor ----------
const byDomain = Object.fromEntries(DOMAINS.map((d) => [d, words.filter((w) => w.domains[0] === d).length]));
const byLevel = Object.fromEntries(CEFR_ORDER.map((l) => [l, words.filter((w) => w.cefr === l).length]));
console.log(`kelime: ${words.length}  (tek kelime ${words.filter((w) => w.kind === 'word').length}, öbek ${words.filter((w) => w.kind === 'chunk').length})`);
console.log('alan:', byDomain);
console.log('seviye:', byLevel);
if (warn.length) console.log('uyarı:\n  ' + warn.join('\n  '));
if (errors.length) {
  console.error('HATA:\n  ' + errors.join('\n  '));
  process.exit(1);
}
