import { useEffect, useRef, useState } from 'react';
import { getPattern, getWord, PATTERNS, WORDS } from '../lib/content';
import { allItems, allSessions, getSettings, putSession, type ExerciseKind, type ItemState, type SessionRecord, type Settings } from '../lib/db';
import { formatDuration, sessionDay, shuffle } from '../lib/day';
import { applyReview, dueItems, dueTomorrowCount, ensureItem, nextDueDate, getTodayPlan, markDayDone, markIntroduced, putItem, recordAttempt, scheduleFirstDay } from '../lib/srs';
import { notifySessionDone } from '../lib/api';
import { sfx } from '../lib/sfx';
import Bird from '../components/Bird';
import Icon from '../components/Icon';
import ScenarioPlay, { type ScenarioOutcome } from './ScenarioPlay';
import {
  CatchStep,
  IntroStep,
  PatternCardStep,
  PatternSceneStep,
  PatternUseStep,
  RecallStep,
  RecognizeStep,
  FixStep,
  UseStep,
  type StepResult,
} from './steps';

type Kind = 'quick' | 'deep' | 'extra';

type Step =
  | { t: 'review'; id: string; as: 'recall' | 'use' }
  | { t: 'p-scene'; id: string; distractors: string[] }
  | { t: 'p-card'; id: string }
  | { t: 'p-use'; id: string; situation: string; n: number }
  | { t: 'intro'; id: string }
  | { t: 'recognize'; id: string; distractors: string[] }
  | { t: 'recall'; id: string }
  | { t: 'catch'; id: string; distractors: string[] }
  | { t: 'use'; id: string }
  | { t: 'fix'; id: string }
  | { t: 'scenario' };

interface Built {
  steps: Step[];
  newIds: string[];
  patternId: string;
  domains: string[];
  todayIds: string[];
}

async function buildSession(kind: Kind): Promise<Built> {
  const plan = await getTodayPlan();
  const deep = kind === 'deep';
  const remaining = plan.newIds.filter((id) => !plan.introduced.includes(id));
  const newIds = remaining.slice(0, deep ? 10 : 4);
  const due = await dueItems();
  const reviews = due.filter((i) => i.type === 'word').slice(0, deep ? 5 : 3);
  const fixes = due.filter((i) => i.type === 'error' && i.error).slice(0, deep ? 3 : 2);

  const pool = (exclude: string) => {
    const same = plan.newIds.filter((x) => x !== exclude);
    const extra = shuffle(WORDS.map((w) => w.id)).filter((x) => x !== exclude && !same.includes(x));
    return shuffle([...same, ...extra.slice(0, 4)]);
  };

  const steps: Step[] = [];
  // 1. Isınma: vadesi gelen öğeler, seçeneksiz sesli geri çağırma. Gün aşırı farklı yönden.
  // Merdivende takılan öğe (ör. tanıma adımında yanılmış) eksik basamağın egzersizini de alır.
  for (const r of reviews) {
    if (r.rung === 0) steps.push({ t: 'recognize', id: r.id, distractors: pool(r.id) });
    if (r.rung === 2) steps.push({ t: 'catch', id: r.id, distractors: pool(r.id) });
  }
  reviews.forEach((r, i) => {
    // Eksik basamak egzersizinden sonra sıradaki basamağın kanıtı istenir.
    const nextRung = r.rung === 0 || r.rung === 2 ? r.rung + 1 : r.rung;
    const as = nextRung === 1 ? 'recall' : nextRung === 3 ? 'use' : (plan.dayNumber + i) % 2 === 0 ? 'recall' : 'use';
    steps.push({ t: 'review', id: r.id, as });
  });
  // Geçmiş senaryolardaki hatalar: doğru hâlini söyle
  fixes.forEach((f) => steps.push({ t: 'fix', id: f.id }));

  // 2. Günün kalıbı (gün içindeki ilk oturumda tam, sonrakilerde yalnızca bir kullanım)
  const p = getPattern(plan.patternId)!;
  const firstToday = !(await allSessions()).some((s) => s.day === plan.day);
  if (firstToday || kind === 'deep') {
    const others = shuffle([...new Set(PATTERNS.filter((x) => x.function !== p.function).map((x) => x.function))]);
    steps.push({ t: 'p-scene', id: p.id, distractors: others });
    steps.push({ t: 'p-card', id: p.id });
  }
  (deep ? p.situations : p.situations.slice(0, 1)).forEach((situation, n) => steps.push({ t: 'p-use', id: p.id, situation, n }));

  // 3. Yeni öğeler: tanıt + tanı, sonra karışık sırayla hatırla; derinde duy ve kullan.
  for (const id of newIds) {
    steps.push({ t: 'intro', id });
    steps.push({ t: 'recognize', id, distractors: pool(id) });
  }
  shuffle(newIds).forEach((id) => steps.push({ t: 'recall', id }));
  if (deep) {
    shuffle(newIds).forEach((id) => steps.push({ t: 'catch', id, distractors: pool(id) }));
    shuffle(newIds).forEach((id) => steps.push({ t: 'use', id }));
  }

  // Yeni öğe kalmadıysa (ekstra pratik): bugünün öğelerini yeniden çağır
  if (newIds.length === 0 && kind === 'extra') {
    shuffle(plan.introduced).slice(0, 6).forEach((id) => steps.push({ t: 'review', id, as: 'recall' }));
  }

  // 4. Senaryo: bugünün kelimeleriyle aynı alandan
  steps.push({ t: 'scenario' });
  const domains = [...new Set(plan.newIds.flatMap((id) => getWord(id)?.domains ?? []))];
  return { steps, newIds, patternId: p.id, domains, todayIds: plan.newIds };
}

interface Stats {
  speakingMs: number;
  recallCorrect: number;
  recallTotal: number;
  rungUps: number;
  helpUsed: number;
  answered: number;
  reviewed: number;
  firstRecall: Record<string, boolean>; // yeni öğe → yardımsız hatırladı mı
  patternUsed: boolean;
  scenario: ScenarioOutcome | null;
}

export default function Session({ kind, onExit }: { kind: Kind; onExit: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [index, setIndex] = useState(0);
  const [report, setReport] = useState<{ lines: string[]; talk: string; recall: string; up: number } | null>(null);
  const stats = useRef<Stats>({ speakingMs: 0, recallCorrect: 0, recallTotal: 0, rungUps: 0, helpUsed: 0, answered: 0, reviewed: 0, firstRecall: {}, patternUsed: false, scenario: null });
  const items = useRef(new Map<string, ItemState>());
  const startedAt = useRef(new Date().toISOString());

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
      setBuilt(await buildSession(kind));
    })();
  }, [kind]);

  if (!settings || !built)
    return (
      <main className="session" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Bird mood="think" size={120} />
      </main>
    );

  const step = built.steps[index];

  async function item(id: string, type: ItemState['type']) {
    const cached = items.current.get(id);
    if (cached) return cached;
    const it = await ensureItem(id, type);
    items.current.set(id, it);
    return it;
  }

  async function record(id: string, type: ItemState['type'], kindOf: ExerciseKind, r: StepResult) {
    const it = await item(id, type);
    if (recordAttempt(it, { kind: kindOf, correct: !!r.correct, helped: !!r.helped })) stats.current.rungUps++;
    stats.current.answered++;
    if (r.helped) stats.current.helpUsed++;
  }

  async function next(r: StepResult) {
    const s = stats.current;
    s.speakingMs += r.speakingMs ?? 0;
    switch (step.t) {
      case 'review': {
        const it = await item(step.id, 'word');
        applyReview(it, !!r.correct, !!r.helped);
        await record(step.id, 'word', step.as, r);
        s.reviewed++;
        s.recallTotal++;
        if (r.correct && !r.helped) s.recallCorrect++;
        break;
      }
      case 'p-scene':
        await record(step.id, 'pattern', 'recognize', r);
        break;
      case 'p-use':
        await record(step.id, 'pattern', step.n === 0 ? 'recall' : 'pattern-use', r);
        if (r.correct) s.patternUsed = true;
        break;
      case 'recognize':
        await record(step.id, 'word', 'recognize', r);
        break;
      case 'recall':
        await record(step.id, 'word', 'recall', r);
        s.recallTotal++;
        if (r.correct && !r.helped) s.recallCorrect++;
        s.firstRecall[step.id] = !!r.correct && !r.helped;
        break;
      case 'catch':
        await record(step.id, 'word', 'catch', r);
        break;
      case 'use':
        await record(step.id, 'word', 'use', r);
        break;
      case 'fix': {
        const it = await item(step.id, 'error');
        applyReview(it, !!r.correct, !!r.helped);
        await record(step.id, 'error', 'review', r);
        s.reviewed++;
        break;
      }
      default:
        break;
    }
    if (index + 1 < built!.steps.length) setIndex(index + 1);
    else await finish();
  }

  async function finish() {
    const s = stats.current;
    // Yeni öğelerin ilk tekrar tarihi
    for (const id of built!.newIds) {
      const it = await item(id, 'word');
      if (!it.card) scheduleFirstDay(it, s.firstRecall[id] ?? false);
    }
    const pat = await item(built!.patternId, 'pattern');
    if (!pat.card) scheduleFirstDay(pat, s.patternUsed);
    for (const it of items.current.values()) await putItem(it);
    // Senaryodan gelen yeni hata kartları ertesi gün tekrar
    for (const e of (await allItems()).filter((x) => x.type === 'error' && !x.card)) {
      scheduleFirstDay(e, false);
      await putItem(e);
    }
    await markIntroduced([...built!.newIds]);

    const day = sessionDay();
    const sessions = await allSessions();
    const prevDays = [...new Set(sessions.map((x) => x.day).filter((d) => d < day))].sort();
    const prevDay = prevDays[prevDays.length - 1];
    const prevMs = sessions.filter((x) => x.day === prevDay).reduce((n, x) => n + x.speakingMs, 0);
    const todayMs = sessions.filter((x) => x.day === day).reduce((n, x) => n + x.speakingMs, 0) + s.speakingMs;
    const dueTomorrow = await dueTomorrowCount();

    const sc = s.scenario;
    const lines: string[] = [];
    lines.push(`Bugün ${formatDuration(todayMs)} konuştun${prevDay ? ` (önceki gün ${formatDuration(prevMs)})` : ''}.`);
    if (s.recallTotal) lines.push(`${s.recallTotal} öğenin ${s.recallCorrect} tanesini yardımsız söyledin.`);
    if (!sc?.played) lines.push('Bugün konuşmadın: senaryo yapılmadı.');
    else if (sc.spontaneous.length) lines.push(`Senaryoda kendiliğinden: ${sc.spontaneous.slice(0, 3).join(', ')}.`);
    else if (sc.userTurns && sc.helpTurns / sc.userTurns > 0.4) lines.push(`Senaryoda çoğu turda yardım aldın (${sc.helpTurns}/${sc.userTurns}).`);
    else lines.push(sc.success ? 'Senaryonun amacına ulaştın.' : 'Senaryonun amacına ulaşamadın.');
    const missed = built!.newIds.filter((id) => s.firstRecall[id] === false).map((id) => getWord(id)?.text);
    const nextDue = await nextDueDate();
    lines.push(
      missed.length
        ? `Yarın önce: ${missed.slice(0, 3).join(', ')}.`
        : dueTomorrow > 0
          ? `Yarın ${dueTomorrow} tekrar seni bekliyor.`
          : `Yarın yeni öğeler; ilk tekrar ${nextDue ? nextDue.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '—'}.`,
    );

    const rec: SessionRecord = {
      id: `${day}-${Date.now()}`,
      day,
      kind,
      startedAt: startedAt.current,
      endedAt: new Date().toISOString(),
      speakingMs: s.speakingMs,
      newItems: built!.newIds,
      reviewed: s.reviewed,
      recallCorrect: s.recallCorrect,
      recallTotal: s.recallTotal,
      rungUps: s.rungUps + (sc?.rungUps ?? 0),
      scenarioSkipped: !sc?.played,
      scenarioId: sc?.scenarioId,
      scenarioSuccess: sc?.success,
      spontaneous: sc?.spontaneous,
      helpUsed: s.helpUsed,
      reportLines: lines.slice(0, 4),
    };
    await putSession(rec);
    await markDayDone();
    void notifySessionDone(day);
    sfx.finish();
    setReport({
      lines: lines.slice(2, 4),
      talk: formatDuration(todayMs),
      recall: s.recallTotal ? `${s.recallCorrect}/${s.recallTotal}` : '—',
      up: s.rungUps + (sc?.rungUps ?? 0),
    });
  }

  if (report) {
    return (
      <main className="session">
        <div className="hero">
          <Bird mood="happy" size={130} say="Bitti!" side="below" />
        </div>
        <div className="stats">
          <div className="stat blue">
            <Icon name="mic" size={26} />
            <span className="v">{report.talk}</span>
            <span className="k">konuştun</span>
          </div>
          <div className="stat mint">
            <Icon name="brain" size={26} />
            <span className="v">{report.recall}</span>
            <span className="k">yardımsız hatırladın</span>
          </div>
          <div className="stat sun">
            <Icon name="up" size={26} />
            <span className="v">{report.up}</span>
            <span className="k">basamak çıktı</span>
          </div>
        </div>
        <div className="card report">
          {report.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="footer">
          <button className="primary go" onClick={onExit}>
            Tamam
          </button>
        </div>
      </main>
    );
  }

  const common = { micMode: settings.micMode, accent: settings.accent, onDone: (r: StepResult) => void next(r) };
  const key = `${index}-${step.t}`;
  return (
    <main className="session">
      <div className="topbar">
        <button className="ghost" onClick={onExit} aria-label="Çık">
          <Icon name="close" size={26} />
        </button>
        <div className="progress">
          <div style={{ width: `${Math.round((index / built.steps.length) * 100)}%` }} />
        </div>
      </div>
      {index === 0 && <p className="muted small center">🔇 Ses yoksa sessiz modu kapat</p>}
      {step.t === 'review' &&
        (step.as === 'recall' ? <RecallStep key={key} id={step.id} review {...common} /> : <UseStep key={key} id={step.id} {...common} />)}
      {step.t === 'p-scene' && <PatternSceneStep key={key} patternId={step.id} distractors={step.distractors} {...common} />}
      {step.t === 'p-card' && <PatternCardStep key={key} patternId={step.id} {...common} />}
      {step.t === 'p-use' && <PatternUseStep key={key} patternId={step.id} situation={step.situation} {...common} />}
      {step.t === 'intro' && <IntroStep key={key} id={step.id} {...common} />}
      {step.t === 'recognize' && <RecognizeStep key={key} id={step.id} distractors={step.distractors} {...common} />}
      {step.t === 'recall' && <RecallStep key={key} id={step.id} {...common} />}
      {step.t === 'catch' && <CatchStep key={key} id={step.id} distractors={step.distractors} {...common} />}
      {step.t === 'use' && <UseStep key={key} id={step.id} {...common} />}
      {step.t === 'fix' && <FixStep key={key} id={step.id} {...common} />}
      {step.t === 'scenario' && (
        <ScenarioPlay
          key={key}
          level={settings.level}
          micMode={settings.micMode}
          domains={built.domains}
          todayIds={built.todayIds}
          patternId={built.patternId}
          length={kind === 'deep' ? 'deep' : 'quick'}
          onDone={(o) => {
            stats.current.scenario = o;
            stats.current.speakingMs += o.speakingMs;
            void finish();
          }}
        />
      )}
    </main>
  );
}
