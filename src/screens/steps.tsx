// Oturum adımları. Her adım tek bir görev gösterir ve bitince onDone ile sonucu döndürür.
import { useEffect, useMemo, useState } from 'react';
import TalkButton from '../components/TalkButton';
import { getPattern, getWord } from '../lib/content';
import { containsTarget, wordDiff } from '../lib/match';
import { shuffle } from '../lib/day';
import { speak, stopSpeaking, type Accent } from '../lib/voice';
import type { HeardResult } from '../lib/voice';

export interface StepResult {
  correct?: boolean;
  helped?: boolean;
  speakingMs?: number;
}

interface Common {
  micMode: 'hold' | 'tap';
  accent: Accent;
  onDone: (r: StepResult) => void;
}

const ACCENTS: Accent[] = ['en-US', 'en-GB', 'en-AU', 'en-IN'];
const otherAccent = (a: Accent) => ACCENTS[(ACCENTS.indexOf(a) + 1) % ACCENTS.length];

function Listen({ text, accent, rate = 1, auto = true, label = 'Tekrar dinle' }: { text: string; accent: Accent; rate?: number; auto?: boolean; label?: string }) {
  useEffect(() => {
    if (auto) void speak(text, { accent, rate });
    return () => stopSpeaking();
  }, [text, accent, rate, auto]);
  return (
    <button className="listen" onClick={() => void speak(text, { accent, rate })}>
      🔊 {label}
    </button>
  );
}

function Diff({ heard, model }: { heard: string; model: string }) {
  return (
    <p className="diff">
      {wordDiff(heard, model).map((w, i) => (
        <span key={i} className={w.ok ? 'hit' : 'miss'}>
          {w.word}{' '}
        </span>
      ))}
    </p>
  );
}

function hintOf(answer: string) {
  return answer
    .split(/\s+/)
    .map((w) => w.replace(/[a-zA-Z]/g, (c, i) => (i === 0 ? c : '_')))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Yeni öğeyi tanıtma

export function IntroStep({ id, accent, onDone }: { id: string } & Common) {
  const w = getWord(id)!;
  useEffect(() => {
    void (async () => {
      await speak(w.text, { accent, rate: 0.9 });
      await speak(w.examples[0], { accent });
    })();
    return () => stopSpeaking();
  }, [w, accent]);
  return (
    <>
      <p className="instr">Yeni öğe. Dinle ve anlamına bak.</p>
      <p className="item-big">{w.text}</p>
      <p className="tr">{w.tr}</p>
      <p className="example">{w.examples[0]}</p>
      <button className="listen" onClick={() => void speak(w.examples[0], { accent })}>
        🔊 Tekrar dinle
      </button>
      <button className="primary" onClick={() => onDone({})}>
        Devam
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// 1. Tanıdı: cümleyi dinle, anlamını seç

/** Cümlede kendisi de geçen çeldiricileri ayıkla (aksi halde iki doğru cevap olur) */
function cleanDistractors(sentence: string, ids: string[]) {
  return ids.filter((d) => {
    const t = getWord(d)?.text;
    return t && !containsTarget(sentence, t).ok;
  });
}

export function RecognizeStep({ id, distractors, accent, onDone }: { id: string; distractors: string[] } & Common) {
  const w = getWord(id)!;
  const sentence = w.examples[1] ?? w.examples[0];
  const options = useMemo(() => shuffle([id, ...cleanDistractors(sentence, distractors).slice(0, 2)]), [id, distractors, sentence]);
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <p className="instr">Dinle. Hangi anlam bu cümlede geçiyor?</p>
      <Listen text={sentence} accent={accent} />
      <div className="options">
        {options.map((o) => (
          <button
            key={o}
            className={picked ? (o === id ? 'opt right' : o === picked ? 'opt wrong' : 'opt') : 'opt'}
            disabled={!!picked}
            onClick={() => setPicked(o)}
          >
            {getWord(o)?.tr}
          </button>
        ))}
      </div>
      {picked && (
        <>
          <p className="example">{sentence}</p>
          <button className="primary" onClick={() => onDone({ correct: picked === id })}>
            Devam
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Hatırladı: Türkçe durumdan İngilizcesini söyle (ısınma tekrarı da bunu kullanır)

export function RecallStep({ id, review, micMode, accent, onDone }: { id: string; review?: boolean } & Common) {
  const w = getWord(id)!;
  const task = w.sayIt[0];
  const [heard, setHeard] = useState<HeardResult | null>(null);
  const [hint, setHint] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [practice, setPractice] = useState<HeardResult | null>(null);
  const result = heard ? containsTarget(heard.transcript, w.text) : null;
  const finished = gaveUp || !!heard;

  useEffect(() => {
    if (finished) void speak(task.en, { accent });
  }, [finished, task.en, accent]);

  return (
    <>
      <p className="instr">{review ? 'Tekrar: ' : ''}İngilizce söyle.</p>
      <p className="situation">{task.tr}</p>
      {hint && !finished && <p className="hint">{hintOf(task.en)}</p>}
      {!finished && (
        <>
          <TalkButton mode={micMode} onResult={setHeard} />
          <div className="row center">
            {!hint && (
              <button className="ghost" onClick={() => setHint(true)}>
                İpucu
              </button>
            )}
            <button className="ghost" onClick={() => setGaveUp(true)}>
              Bilmiyorum
            </button>
          </div>
        </>
      )}
      {finished && (
        <>
          {heard && (
            <p className={result?.ok ? 'verdict ok' : 'verdict bad'}>
              {result?.ok ? `“${w.text}” doğru yerde.` : heard.transcript ? `“${w.text}” duyulmadı.` : 'Ses alınamadı.'}
            </p>
          )}
          {heard?.transcript && <p className="heard">Sen: {heard.transcript}</p>}
          <Diff heard={heard?.transcript ?? ''} model={task.en} />
          <button className="listen" onClick={() => void speak(task.en, { accent })}>
            🔊 Dinle
          </button>
          {!result?.ok && !practice && (
            <>
              <p className="muted small">Şimdi bir kez sesli tekrar et.</p>
              <TalkButton mode={micMode} onResult={setPractice} label="Tekrar et" />
            </>
          )}
          {practice && <p className="heard">Tekrar: {practice.transcript || '—'}</p>}
          <button
            className="primary"
            onClick={() =>
              onDone({
                correct: !!result?.ok,
                helped: hint,
                speakingMs: (heard?.durationMs ?? 0) + (practice?.durationMs ?? 0),
              })
            }
          >
            Devam
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Duydu: hızlı (1.25×) cümlede hangisi geçti

export function CatchStep({ id, distractors, accent, onDone }: { id: string; distractors: string[] } & Common) {
  const w = getWord(id)!;
  const sentence = w.examples[0];
  const options = useMemo(() => shuffle([id, ...cleanDistractors(sentence, distractors).slice(0, 3)]), [id, distractors, sentence]);
  const [picked, setPicked] = useState<string | null>(null);
  const acc = otherAccent(accent);
  return (
    <>
      <p className="instr">Hızlı konuşma. Hangisini duydun?</p>
      <Listen text={sentence} accent={acc} rate={1.25} />
      <div className="options">
        {options.map((o) => (
          <button
            key={o}
            className={picked ? (o === id ? 'opt right' : o === picked ? 'opt wrong' : 'opt') : 'opt'}
            disabled={!!picked}
            onClick={() => setPicked(o)}
          >
            {getWord(o)?.text}
          </button>
        ))}
      </div>
      {picked && (
        <>
          <p className="example">{sentence}</p>
          <button className="primary" onClick={() => onDone({ correct: picked === id })}>
            Devam
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Kullandı: boşluklu cümleyi tam olarak söyle

function blankOut(sentence: string, target: string) {
  const re = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
  if (re.test(sentence)) return sentence.replace(re, '_____');
  const first = target.split(/\s+/)[0];
  const re2 = new RegExp(`\\b${first.replace(/[^a-zA-Z']/g, '')}\\w*`, 'i');
  return sentence.replace(re2, '_____');
}

export function UseStep({ id, micMode, accent, onDone }: { id: string } & Common) {
  const w = getWord(id)!;
  const sentence = w.examples[1] ?? w.examples[0];
  const blanked = blankOut(sentence, w.text);
  const [heard, setHeard] = useState<HeardResult | null>(null);
  const result = heard ? containsTarget(heard.transcript, w.text) : null;
  return (
    <>
      <p className="instr">Boşluğu doldurarak cümlenin tamamını söyle.</p>
      <p className="situation en">{blanked}</p>
      <p className="tr small">{w.tr}</p>
      {!heard ? (
        <TalkButton mode={micMode} onResult={setHeard} />
      ) : (
        <>
          <p className={result?.ok ? 'verdict ok' : 'verdict bad'}>{result?.ok ? 'Doğru kullandın.' : `“${w.text}” duyulmadı.`}</p>
          {heard.transcript && <p className="heard">Sen: {heard.transcript}</p>}
          <Diff heard={heard.transcript} model={sentence} />
          <button className="listen" onClick={() => void speak(sentence, { accent })}>
            🔊 Dinle
          </button>
          <button className="primary" onClick={() => onDone({ correct: !!result?.ok, speakingMs: heard.durationMs })}>
            Devam
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Günün kalıbı

export function PatternSceneStep({ patternId, accent, onDone, distractors }: { patternId: string; distractors: string[] } & Common) {
  const p = getPattern(patternId)!;
  const [played, setPlayed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const options = useMemo(() => shuffle([p.function, ...distractors.slice(0, 2)]), [p, distractors]);

  const play = async () => {
    const accB = otherAccent(accent);
    for (const l of p.miniScene) await speak(l.line, { accent: l.speaker === 'A' ? accent : accB });
    setPlayed(true);
  };
  useEffect(() => {
    void play();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternId]);

  return (
    <>
      <p className="instr">Günün kalıbı. Dinle: B ne yapıyor?</p>
      <button className="listen" onClick={() => void play()}>
        🔊 Sahneyi dinle
      </button>
      {picked && (
        <div className="scene">
          {p.miniScene.map((l, i) => (
            <p key={i}>
              <b>{l.speaker}:</b> {l.line}
            </p>
          ))}
        </div>
      )}
      <div className="options">
        {options.map((o) => (
          <button
            key={o}
            className={picked ? (o === p.function ? 'opt right' : o === picked ? 'opt wrong' : 'opt') : 'opt'}
            disabled={!!picked || !played}
            onClick={() => setPicked(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {picked && (
        <button className="primary" onClick={() => onDone({ correct: picked === p.function })}>
          Devam
        </button>
      )}
    </>
  );
}

export function PatternCardStep({ patternId, accent, onDone }: { patternId: string } & Common) {
  const p = getPattern(patternId)!;
  const reg = { casual: 'samimi', neutral: 'nötr', formal: 'resmi' }[p.register];
  return (
    <>
      <p className="item-big">{p.text}</p>
      <p className="tr">
        {p.function} · {reg}
      </p>
      <div className="card">
        {p.variations.map((v) => (
          <p key={v}>
            <button className="link" onClick={() => void speak(v.replace(/…/g, ''), { accent })}>
              🔊
            </button>{' '}
            {v}
          </p>
        ))}
      </div>
      <div className="card">
        <p className="bad">✗ {p.turkishMistake.wrong}</p>
        <p className="ok">✓ {p.turkishMistake.right}</p>
        <p className="muted small">{p.turkishMistake.why}</p>
      </div>
      <button className="primary" onClick={() => onDone({})}>
        Devam
      </button>
    </>
  );
}

export function PatternUseStep({ patternId, situation, micMode, onDone }: { patternId: string; situation: string } & Common) {
  const p = getPattern(patternId)!;
  const [heard, setHeard] = useState<HeardResult | null>(null);
  const ok = heard ? [p.text, ...p.variations].some((v) => containsTarget(heard.transcript, v).ok) : false;
  return (
    <>
      <p className="instr">Bu durumda kalıpla bir cümle kur.</p>
      <p className="situation">{situation}</p>
      <p className="muted small">{p.text}</p>
      {!heard ? (
        <TalkButton mode={micMode} onResult={setHeard} />
      ) : (
        <>
          <p className={ok ? 'verdict ok' : 'verdict bad'}>{ok ? 'Kalıbı kullandın.' : 'Kalıp duyulmadı.'}</p>
          <p className="heard">Sen: {heard.transcript || '—'}</p>
          <button className="primary" onClick={() => onDone({ correct: ok, speakingMs: heard.durationMs })}>
            Devam
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export function ScenarioPlaceholderStep({ onDone }: Common) {
  return (
    <>
      <p className="instr">Senaryo</p>
      <div className="card">
        <p>Yapay zekâ ile sesli senaryo, Worker kurulunca açılacak.</p>
        <p className="muted small">Bugünün raporunda "serbest konuşma yok" yazacak.</p>
      </div>
      <button className="primary" onClick={() => onDone({})}>
        Devam
      </button>
    </>
  );
}
