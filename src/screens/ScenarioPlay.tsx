// Sesli senaryo: kart → karakterle sohbet → analiz ve düzeltme kartları → (isteğe bağlı) ikinci tur.
import { useEffect, useRef, useState } from 'react';
import Bird from '../components/Bird';
import Character, { propForRole } from '../components/Character';
import Icon from '../components/Icon';
import TalkButton from '../components/TalkButton';
import { workerConfigured } from '../lib/api';
import { chatStream, parseJsonLoose, partialReply, type ChatMessage } from '../lib/llm';
import {
  analyse,
  applyAnalysis,
  askHelp,
  askNatural,
  OPENING,
  pickScenario,
  rememberScenario,
  secondRound,
  systemPrompt,
  targetItems,
  type Analysis,
  type TurnRecord,
} from '../lib/scenario';
import { sfx } from '../lib/sfx';
import { speak, stopSpeaking, type Accent, type HeardResult } from '../lib/voice';
import type { Cefr, ScenarioSkeleton, TurnNotes } from '../lib/types';

export interface ScenarioOutcome {
  played: boolean;
  scenarioId?: string;
  success?: boolean;
  speakingMs: number;
  helpTurns: number;
  userTurns: number;
  spontaneous: string[];
  rungUps: number;
  rounds: { speakingMs: number; helpTurns: number; userTurns: number }[];
}

interface Props {
  level: Cefr;
  micMode: 'hold' | 'tap';
  domains: string[];
  todayIds: string[];
  patternId: string;
  length: 'quick' | 'deep';
  onDone: (o: ScenarioOutcome) => void;
}

type Phase = 'loading' | 'nokey' | 'card' | 'chat' | 'analysing' | 'result' | 'error';

/** Cümleleri sırayla seslendiren kuyruk: cevap akarken tamamlanan her cümle hemen okunur. */
function useSpeechQueue(accent: Accent, setTalking: (b: boolean) => void) {
  const queue = useRef<Promise<void>>(Promise.resolve());
  const spoken = useRef(0);
  const reset = () => {
    spoken.current = 0;
  };
  const feed = (text: string, final: boolean) => {
    const rest = text.slice(spoken.current);
    let cut = -1;
    if (final) cut = rest.length;
    else {
      const re = /[.!?](\s|$)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(rest))) cut = m.index + 1;
      if (cut === -1 && rest.length > 90) cut = rest.lastIndexOf(',') + 1 || -1; // uzun cümlede virgülde böl
    }
    if (cut <= 0) return;
    const chunk = rest.slice(0, cut).trim();
    spoken.current += cut;
    if (!chunk) return;
    queue.current = queue.current.then(async () => {
      setTalking(true);
      await speak(chunk, { accent });
      setTalking(false);
    });
  };
  const done = () => queue.current;
  return { feed, reset, done };
}

export default function ScenarioPlay({ level, micMode, domains, todayIds, patternId, length, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [scenario, setScenario] = useState<ScenarioSkeleton | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [aiText, setAiText] = useState('');
  const [aiTalking, setAiTalking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [done, setDone] = useState(false);
  const [help, setHelp] = useState<{ level: number; text: string; loading: boolean }>({ level: 0, text: '', loading: false });
  const [askTurkish, setAskTurkish] = useState(false);
  const [natural, setNatural] = useState<Record<number, { casual: string; polite: string; why: string } | 'loading'>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [applied, setApplied] = useState<{ spontaneous: string[]; rungUps: number } | null>(null);
  const [error, setError] = useState('');
  const messages = useRef<ChatMessage[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const rounds = useRef<ScenarioOutcome['rounds']>([]);
  const totals = useRef({ spontaneous: [] as string[], rungUps: 0, success: false });
  const played = useRef<string[]>([]);
  const accent = (scenario?.persona.accent ?? 'en-US') as Accent;
  const q = useSpeechQueue(accent, setAiTalking);
  const maxTurns = length === 'deep' ? 12 : 6;
  const userTurns = turns.filter((t) => t.speaker === 'L').length;

  useEffect(() => {
    void (async () => {
      if (!(await workerConfigured())) return setPhase('nokey');
      const s = await pickScenario(domains, level, length);
      setScenario(s);
      setTargets(await targetItems(todayIds));
      setPhase('card');
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yeni mesajda sohbeti en alta kaydır
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, aiText, natural, help.text]);

  // ---------- Sohbet ----------

  async function aiTurn() {
    setWaiting(true);
    setAiText('');
    q.reset();
    try {
      const raw = await chatStream(messages.current, (r) => {
        setAiText(r);
        q.feed(r, false);
      });
      let reply = partialReply(raw);
      let notes: TurnNotes | undefined;
      let finished = false;
      try {
        const j = parseJsonLoose<{ reply: string; notes?: TurnNotes; done?: boolean }>(raw);
        reply = j.reply || reply;
        notes = j.notes;
        finished = !!j.done;
      } catch {
        if (!reply) reply = raw.replace(/[{}"]/g, '').trim();
      }
      setAiText(reply);
      q.feed(reply, true);
      messages.current.push({ role: 'assistant', content: JSON.stringify({ reply }) });
      setTurns((ts) => {
        const copy = [...ts];
        // notlar öğrencinin son mesajına aittir
        for (let i = copy.length - 1; i >= 0; i--)
          if (copy[i].speaker === 'L') {
            copy[i] = { ...copy[i], notes };
            break;
          }
        return [...copy, { speaker: 'A', text: reply, help: 0 }];
      });
      if (finished) setDone(true);
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    } finally {
      setWaiting(false);
    }
  }

  async function start() {
    if (!scenario) return;
    played.current.push(scenario.id);
    messages.current = [{ role: 'system', content: systemPrompt(scenario, level, targets, patternId) }, OPENING];
    setTurns([]);
    setDone(false);
    setPhase('chat');
    await aiTurn();
  }

  async function onHeard(h: HeardResult) {
    if (!h.transcript) return;
    stopSpeaking();
    const turn: TurnRecord = { speaker: 'L', text: h.transcript, help: help.level, durationMs: h.durationMs };
    setTurns((t) => [...t, turn]);
    setHelp({ level: 0, text: '', loading: false });
    setAskTurkish(false);
    messages.current.push({ role: 'user', content: h.transcript });
    if (userTurns + 1 >= maxTurns) {
      messages.current.push({ role: 'user', content: '(Time is up. Wrap up the scene politely in one short line and set "done": true.)' });
    }
    await aiTurn();
  }

  async function nextHelp(turkish?: string) {
    if (!scenario) return;
    const lvl = turkish ? 3 : Math.min(4, help.level + 1);
    if (lvl === 3 && !turkish) {
      setHelp((h) => ({ ...h, level: 3, text: '' }));
      setAskTurkish(true);
      return;
    }
    setAskTurkish(false);
    setHelp({ level: lvl, text: '', loading: true });
    try {
      const lastAi = [...turns].reverse().find((t) => t.speaker === 'A')?.text ?? '';
      const text = await askHelp(scenario, level, lvl, lastAi, turkish);
      setHelp({ level: lvl, text, loading: false });
      if (lvl >= 3) void speak(text, { accent });
    } catch (e) {
      setHelp({ level: lvl, text: (e as Error).message, loading: false });
    }
  }

  async function moreNatural(i: number) {
    if (!scenario || natural[i]) return;
    setNatural((n) => ({ ...n, [i]: 'loading' }));
    try {
      const r = await askNatural(scenario, level, turns[i].text);
      setNatural((n) => ({ ...n, [i]: r }));
    } catch {
      setNatural((n) => {
        const c = { ...n };
        delete c[i];
        return c;
      });
    }
  }

  // ---------- Bitiş ----------

  async function finish() {
    if (!scenario) return;
    stopSpeaking();
    setPhase('analysing');
    const ls = turns.filter((t) => t.speaker === 'L');
    rounds.current.push({
      speakingMs: ls.reduce((n, t) => n + (t.durationMs ?? 0), 0),
      helpTurns: ls.filter((t) => t.help > 0).length,
      userTurns: ls.length,
    });
    try {
      const a = ls.length ? await analyse(scenario, level, targets, patternId, turns) : null;
      if (a) {
        const r = await applyAnalysis(a, patternId);
        totals.current.spontaneous.push(...r.spontaneous);
        totals.current.rungUps += r.rungUps;
        totals.current.success ||= a.goalAchieved;
        setApplied(r);
        if (a.goalAchieved) sfx.correct();
      }
      await rememberScenario(scenario, !!a?.goalAchieved);
      setAnalysis(a);
      setPhase('result');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  function outcome(): ScenarioOutcome {
    const r = rounds.current;
    return {
      played: r.some((x) => x.userTurns > 0),
      scenarioId: played.current[0],
      success: totals.current.success,
      speakingMs: r.reduce((n, x) => n + x.speakingMs, 0),
      helpTurns: r.reduce((n, x) => n + x.helpTurns, 0),
      userTurns: r.reduce((n, x) => n + x.userTurns, 0),
      spontaneous: [...new Set(totals.current.spontaneous)],
      rungUps: totals.current.rungUps,
      rounds: r,
    };
  }

  function playSecondRound() {
    if (!scenario) return;
    const next = secondRound(scenario);
    if (!next) return;
    setScenario(next);
    setAnalysis(null);
    setApplied(null);
    setNatural({});
    setPhase('card');
  }

  // ---------- Görünüm ----------

  if (phase === 'loading') return <Bird mood="think" size={100} />;

  if (phase === 'nokey')
    return (
      <div className="step">
        <Bird mood="think" size={72} say="Önce kurulum!" />
        <p className="muted center">Sesli sohbet için Ayarlar → Worker bağlantısı gerekli.</p>
        <div className="footer">
          <button className="primary" onClick={() => onDone({ ...outcome(), played: false })}>
            Devam
          </button>
        </div>
      </div>
    );

  if (phase === 'error')
    return (
      <div className="step">
        <Bird mood="sad" size={72} say="Bağlantı sorunu" />
        <p className="muted center">{error}</p>
        <div className="footer">
          {turns.length > 0 && (
            <button className="secondary" onClick={() => void finish()}>
              Analize geç
            </button>
          )}
          <button className="primary" onClick={() => onDone(outcome())}>
            Devam
          </button>
        </div>
      </div>
    );

  if (!scenario) return null;
  const prop = propForRole(scenario.aiRole);

  if (phase === 'card')
    return (
      <div className="step">
        <Bird mood="happy" size={64} say={rounds.current.length ? 'İkinci tur!' : 'Senaryo!'} />
        <div className="scenario-card pop">
          <Character seed={scenario.aiRole} prop={prop} size={96} />
          <div>
            <p className="label">Nerede · kimsin</p>
            <p className="value">
              {scenario.situation} · <b>{scenario.userRole}</b>
            </p>
            <p className="label">Amacın</p>
            <p className="value goal">{scenario.goal}</p>
            <p className="label">Karşındaki</p>
            <p className="value">{scenario.aiRole}</p>
          </div>
        </div>
        <p className="muted small center">Bilmediğin bir şey olacak. Dinle ve uyum sağla.</p>
        <div className="footer">
          <button className="primary go" onClick={() => void start()}>
            Başla
          </button>
        </div>
      </div>
    );

  if (phase === 'chat') {
    const lastIdx = turns.length - 1;
    return (
      <div className="step chat">
        <div className="chat-head">
          <Character seed={scenario.aiRole} prop={prop} size={64} talking={aiTalking} />
          <div className="chat-goal">
            <span className="label">Amacın</span>
            {scenario.goal}
          </div>
        </div>
        <div className="chat-log" ref={logRef}>
          {turns.map((t, i) => (
            <div key={i} className={`msg ${t.speaker === 'A' ? 'ai' : 'me'}${i < lastIdx - 1 ? ' old' : ''}`}>
              <div className="bubble">
                {t.speaker === 'A' && i === lastIdx && waiting ? aiText || '…' : t.text}
                {t.speaker === 'L' && (t.notes?.errors?.length ?? 0) > 0 && <span className="err-dot" title="Sonra bakacağız" />}
              </div>
              {t.speaker === 'L' && (
                <div className="msg-tools">
                  {natural[i] === undefined && (
                    <button className="chip tiny" onClick={() => void moreNatural(i)}>
                      ✨ Daha doğal?
                    </button>
                  )}
                  {natural[i] === 'loading' && <span className="muted small">…</span>}
                  {natural[i] && natural[i] !== 'loading' && (
                    <div className="natural pop">
                      <p>
                        <b>Samimi:</b> {(natural[i] as { casual: string }).casual}
                      </p>
                      <p>
                        <b>Kibar:</b> {(natural[i] as { polite: string }).polite}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {waiting && turns[lastIdx]?.speaker !== 'A' && (
            <div className="msg ai">
              <div className="bubble">{aiText || '…'}</div>
            </div>
          )}
        </div>

        {help.level > 0 && (
          <div className="help-card pop">
            <span className="label">Yardım {help.level}/4</span>
            {help.loading ? '…' : help.text}
            {askTurkish && (
              <>
                <p className="small">Ne demek istediğini Türkçe söyle:</p>
                <TalkButton mode={micMode} lang="tr-TR" label="Türkçe söyle" onResult={(r) => r.transcript && void nextHelp(r.transcript)} />
              </>
            )}
          </div>
        )}

        <div className="footer">
          {!done && !askTurkish && <TalkButton mode={micMode} onResult={(h) => void onHeard(h)} disabled={waiting} />}
          <div className="row center">
            {!done && help.level < 4 && !askTurkish && (
              <button className="chip" onClick={() => void nextHelp()} disabled={waiting || help.loading}>
                <Icon name="bulb" size={18} /> {['İpucu', 'Başlangıç', 'Türkçe söyle', 'Tam cümle'][help.level]}
              </button>
            )}
            <button className={done ? 'primary go' : 'chip'} onClick={() => void finish()} disabled={waiting}>
              {done ? 'Sonucu gör' : 'Bitir'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'analysing')
    return (
      <div className="step" style={{ alignItems: 'center' }}>
        <Bird mood="think" size={110} say="İnceliyorum…" side="below" />
      </div>
    );

  // result
  const a = analysis;
  const canSecond = rounds.current.length < 2 && !!secondRound(scenario);
  const r = rounds.current;
  return (
    <div className="step">
      <Bird mood={a?.goalAchieved ? 'happy' : 'sad'} size={72} say={a?.goalAchieved ? 'Amaç tamam!' : 'Amaç olmadı'} />
      {r.length === 2 && (
        <div className="card small">
          <b>1. tur → 2. tur:</b> {Math.round(r[0].speakingMs / 1000)} sn → {Math.round(r[1].speakingMs / 1000)} sn konuşma · yardım {r[0].helpTurns} → {r[1].helpTurns}
        </div>
      )}
      {applied && applied.spontaneous.length > 0 && (
        <div className="feedback good">
          <div className="title">
            <Icon name="up" size={24} stroke={3} /> Kendiliğinden: {applied.spontaneous.join(', ')}
          </div>
        </div>
      )}
      {a?.goodUse && (
        <div className="feedback good">
          <div className="title">
            <Icon name="check" size={24} stroke={3} /> “{a.goodUse.quote}”
          </div>
          <span className="you">{a.goodUse.whyTr}</span>
        </div>
      )}
      {a?.corrections.map((c, i) => (
        <div key={i} className="fix-card pop" style={{ animationDelay: `${i * 0.1}s` }}>
          <p className="was">{c.quote}</p>
          <p className="now">
            {c.better}{' '}
            <button className="link" aria-label="Dinle" onClick={() => void speak(c.better, { accent })}>
              <Icon name="speaker" size={18} />
            </button>
          </p>
          <p className="muted small">{c.whyTr}</p>
        </div>
      ))}
      {!a && <p className="muted center">Hiç konuşmadın, analiz yok.</p>}
      <div className="footer">
        {canSecond && (
          <button className="secondary" onClick={playSecondRound}>
            İkinci tur: yeni olay
          </button>
        )}
        <button className="primary" onClick={() => onDone(outcome())}>
          Devam
        </button>
      </div>
    </div>
  );
}
