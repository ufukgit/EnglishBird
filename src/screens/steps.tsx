// Oturum adımları. Her adım tek bir görev gösterir; yönergeyi maskot kısa bir tepkiyle verir.
import { useEffect, useMemo, useRef, useState } from 'react';
import TalkButton from '../components/TalkButton';
import Bird, { type BirdMood } from '../components/Bird';
import Character, { propForRole } from '../components/Character';
import Icon from '../components/Icon';
import { getPattern, getWord } from '../lib/content';
import { containsTarget, wordDiff } from '../lib/match';
import { shuffle } from '../lib/day';
import { sfx } from '../lib/sfx';
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

// ---------------------------------------------------------------------------
// Ortak parçalar

function Coach({ mood = 'idle', say }: { mood?: BirdMood; say: string }) {
  return <Bird mood={mood} size={72} say={say} />;
}

function ListenButtons({ text, accent, rate = 1, auto = true, slow = true }: { text: string; accent: Accent; rate?: number; auto?: boolean; slow?: boolean }) {
  useEffect(() => {
    if (auto) void speak(text, { accent, rate });
    return () => stopSpeaking();
  }, [text, accent, rate, auto]);
  return (
    <div className="listen-row">
      <button className="round" style={{ width: 84, height: 84 }} aria-label="Dinle" onClick={() => void speak(text, { accent, rate })}>
        <Icon name="speaker" size={40} />
      </button>
      {slow && (
        <button className="round soft" style={{ width: 84, height: 84 }} aria-label="Yavaş dinle" onClick={() => void speak(text, { accent, rate: 0.7 })}>
          <span className="speed">0.7×</span>
        </button>
      )}
    </div>
  );
}

function Continue({ onClick, good }: { onClick: () => void; good?: boolean }) {
  return (
    <div className="footer">
      <button className={`primary${good === undefined ? '' : good ? ' go' : ' stop'}`} onClick={onClick}>
        Devam
      </button>
    </div>
  );
}

function Feedback({ good, title, children }: { good: boolean; title: string; children?: React.ReactNode }) {
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (good) sfx.correct();
    else sfx.wrong();
  }, [good]);
  return (
    <div className={`feedback ${good ? 'good' : 'bad'}`}>
      <div className="title">
        <Icon name={good ? 'check' : 'close'} size={26} stroke={3} /> {title}
      </div>
      {children}
    </div>
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

function useChoice(correctId: string) {
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (o: string) => {
    setPicked(o);
    if (o === correctId) sfx.correct();
    else sfx.wrong();
  };
  const cls = (o: string) => (picked ? (o === correctId ? 'opt right' : o === picked ? 'opt wrong' : 'opt') : 'opt');
  return { picked, pick, cls };
}

/** Cümlede kendisi de geçen çeldiricileri ayıkla (aksi halde iki doğru cevap olur) */
function cleanDistractors(sentence: string, ids: string[]) {
  return ids.filter((d) => {
    const t = getWord(d)?.text;
    return t && !containsTarget(sentence, t).ok;
  });
}

// ---------------------------------------------------------------------------
// Yeni öğeyi tanıtma

export function IntroStep({ id, accent, onDone }: { id: string } & Common) {
  const w = getWord(id)!;
  const [talking, setTalking] = useState(true);
  useEffect(() => {
    void (async () => {
      setTalking(true);
      await speak(w.text, { accent, rate: 0.9 });
      await speak(w.examples[0], { accent });
      setTalking(false);
    })();
    return () => stopSpeaking();
  }, [w, accent]);
  return (
    <div className="step">
      <Coach mood={talking ? 'talk' : 'idle'} say="Yeni!" />
      <div className="card pop" style={{ textAlign: 'center' }}>
        <p className="item-big">{w.text}</p>
        <p className="tr">{w.tr}</p>
      </div>
      <p className="example">{w.examples[0]}</p>
      <ListenButtons text={w.examples[0]} accent={accent} auto={false} />
      <Continue onClick={() => onDone({})} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Tanıdı: cümleyi dinle, anlamını seç

export function RecognizeStep({ id, distractors, accent, onDone }: { id: string; distractors: string[] } & Common) {
  const w = getWord(id)!;
  const sentence = w.examples[1] ?? w.examples[0];
  const options = useMemo(() => shuffle([id, ...cleanDistractors(sentence, distractors).slice(0, 2)]), [id, distractors, sentence]);
  const { picked, pick, cls } = useChoice(id);
  return (
    <div className="step">
      <Coach mood={picked ? (picked === id ? 'happy' : 'sad') : 'listen'} say="Dinle. Hangisi?" />
      <ListenButtons text={sentence} accent={accent} />
      <div className="options">
        {options.map((o) => (
          <button key={o} className={cls(o)} disabled={!!picked} onClick={() => pick(o)}>
            {getWord(o)?.tr}
          </button>
        ))}
      </div>
      {picked && <p className="example pop">{sentence}</p>}
      {picked && <Continue good={picked === id} onClick={() => onDone({ correct: picked === id })} />}
    </div>
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

  const mood: BirdMood = !finished ? 'think' : result?.ok ? 'happy' : 'sad';
  return (
    <div className="step">
      <Coach mood={mood} say={review ? 'Hatırla! İngilizce?' : 'İngilizce söyle!'} />
      <p className="situation">{task.tr}</p>
      {hint && !finished && <p className="hint pop">{hintOf(task.en)}</p>}
      {!finished && (
        <>
          <TalkButton mode={micMode} onResult={setHeard} />
          <div className="row center">
            {!hint && (
              <button className="chip" onClick={() => setHint(true)}>
                <Icon name="bulb" size={18} /> İpucu
              </button>
            )}
            <button className="chip" onClick={() => setGaveUp(true)}>
              Bilmiyorum
            </button>
          </div>
        </>
      )}
      {finished && (
        <>
          <Feedback good={!!result?.ok} title={result?.ok ? 'Doğru!' : heard?.transcript ? 'Tam değil' : gaveUp ? 'Şöyle:' : 'Duyamadım'}>
            {heard?.transcript && <span className="you">Sen: {heard.transcript}</span>}
            <Diff heard={heard?.transcript ?? ''} model={task.en} />
          </Feedback>
          <div className="row center">
            <button className="round small soft" aria-label="Dinle" onClick={() => void speak(task.en, { accent })}>
              <Icon name="speaker" size={24} />
            </button>
          </div>
          {!result?.ok && !practice && <TalkButton mode={micMode} onResult={setPractice} label="Tekrar et" />}
          {practice && <p className="interim">{practice.transcript || '—'}</p>}
          <Continue
            good={!!result?.ok}
            onClick={() =>
              onDone({
                correct: !!result?.ok,
                helped: hint,
                speakingMs: (heard?.durationMs ?? 0) + (practice?.durationMs ?? 0),
              })
            }
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Duydu: hızlı (1.25×) cümlede hangisi geçti

export function CatchStep({ id, distractors, accent, onDone }: { id: string; distractors: string[] } & Common) {
  const w = getWord(id)!;
  const sentence = w.examples[0];
  const options = useMemo(() => shuffle([id, ...cleanDistractors(sentence, distractors).slice(0, 3)]), [id, distractors, sentence]);
  const { picked, pick, cls } = useChoice(id);
  return (
    <div className="step">
      <Coach mood={picked ? (picked === id ? 'happy' : 'sad') : 'listen'} say="Hızlı! Ne duydun?" />
      <ListenButtons text={sentence} accent={otherAccent(accent)} rate={1.25} slow={false} />
      <div className="options">
        {options.map((o) => (
          <button key={o} className={cls(o)} disabled={!!picked} onClick={() => pick(o)}>
            {getWord(o)?.text}
          </button>
        ))}
      </div>
      {picked && <p className="example pop">{sentence}</p>}
      {picked && <Continue good={picked === id} onClick={() => onDone({ correct: picked === id })} />}
    </div>
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
    <div className="step">
      <Coach mood={!heard ? 'think' : result?.ok ? 'happy' : 'sad'} say="Tamamla ve söyle!" />
      <p className="situation en">{blanked}</p>
      <p className="tr center">{w.tr}</p>
      {!heard ? (
        <TalkButton mode={micMode} onResult={setHeard} />
      ) : (
        <>
          <Feedback good={!!result?.ok} title={result?.ok ? 'Harika!' : 'Tam değil'}>
            {heard.transcript && <span className="you">Sen: {heard.transcript}</span>}
            <Diff heard={heard.transcript} model={sentence} />
          </Feedback>
          <div className="row center">
            <button className="round small soft" aria-label="Dinle" onClick={() => void speak(sentence, { accent })}>
              <Icon name="speaker" size={24} />
            </button>
          </div>
          <Continue good={!!result?.ok} onClick={() => onDone({ correct: !!result?.ok, speakingMs: heard.durationMs })} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Günün kalıbı: iki karakterli mini sahne

export function PatternSceneStep({ patternId, accent, onDone, distractors }: { patternId: string; distractors: string[] } & Common) {
  const p = getPattern(patternId)!;
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const options = useMemo(() => shuffle([p.function, ...distractors.slice(0, 2)]), [p, distractors]);
  const { picked, pick, cls } = useChoice(p.function);
  const played = shown >= p.miniScene.length;

  const play = async () => {
    const accB = otherAccent(accent);
    for (let i = 0; i < p.miniScene.length; i++) {
      const l = p.miniScene[i];
      setSpeaker(l.speaker);
      setShown((n) => Math.max(n, i + 1));
      await speak(l.line, { accent: l.speaker === 'A' ? accent : accB });
    }
    setSpeaker(null);
  };
  useEffect(() => {
    void play();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternId]);

  return (
    <div className="step">
      <Coach mood={picked ? (picked === p.function ? 'happy' : 'sad') : 'listen'} say="B ne yapıyor?" />
      <div className="scene-stage">
        <Character seed={`${patternId}-A`} talking={speaker === 'A'} size={84} />
        <button className="round soft" aria-label="Tekrar dinle" onClick={() => void play()}>
          <Icon name="speaker" size={28} />
        </button>
        <Character seed={`${patternId}-B`} talking={speaker === 'B'} size={84} flip />
      </div>
      {picked &&
        p.miniScene.map((l, i) => (
          <div key={i} className={`scene-line ${l.speaker === 'B' ? 'b' : 'a'}`}>
            <div className="bubble">{l.line}</div>
          </div>
        ))}
      <div className="options">
        {options.map((o) => (
          <button key={o} className={cls(o)} disabled={!!picked || !played} onClick={() => pick(o)}>
            {o}
          </button>
        ))}
      </div>
      {picked && <Continue good={picked === p.function} onClick={() => onDone({ correct: picked === p.function })} />}
    </div>
  );
}

export function PatternCardStep({ patternId, accent, onDone }: { patternId: string } & Common) {
  const p = getPattern(patternId)!;
  const reg = { casual: 'samimi', neutral: 'nötr', formal: 'resmi' }[p.register];
  return (
    <div className="step">
      <Coach mood="happy" say="Günün kalıbı!" />
      <div className="pattern-card pop">
        <div className="label">
          {p.function} · {reg}
        </div>
        <div className="text">{p.text}</div>
      </div>
      <div className="options">
        {p.variations.map((v) => (
          <button key={v} className="opt" onClick={() => void speak(v.replace(/…/g, ''), { accent })}>
            <Icon name="speaker" size={18} /> {v}
          </button>
        ))}
      </div>
      <div className="card">
        <p className="bad" style={{ textDecoration: 'line-through', fontWeight: 700 }}>
          {p.turkishMistake.wrong}
        </p>
        <p className="ok" style={{ fontWeight: 800 }}>
          {p.turkishMistake.right}
        </p>
        <p className="muted small">{p.turkishMistake.why}</p>
      </div>
      <Continue onClick={() => onDone({})} />
    </div>
  );
}

export function PatternUseStep({ patternId, situation, micMode, onDone }: { patternId: string; situation: string } & Common) {
  const p = getPattern(patternId)!;
  const [heard, setHeard] = useState<HeardResult | null>(null);
  const ok = heard ? [p.text, ...p.variations].some((v) => containsTarget(heard.transcript, v).ok) : false;
  return (
    <div className="step">
      <Coach mood={!heard ? 'think' : ok ? 'happy' : 'sad'} say="Kalıpla söyle!" />
      <p className="situation">{situation}</p>
      <div className="row center">
        <span className="pill">{p.text}</span>
      </div>
      {!heard ? (
        <TalkButton mode={micMode} onResult={setHeard} />
      ) : (
        <>
          <Feedback good={ok} title={ok ? 'Kalıbı kullandın!' : 'Kalıp duyulmadı'}>
            <span className="you">Sen: {heard.transcript || '—'}</span>
          </Feedback>
          <Continue good={ok} onClick={() => onDone({ correct: ok, speakingMs: heard.durationMs })} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ScenarioPlaceholderStep({ onDone }: Common) {
  return (
    <div className="step">
      <Coach mood="think" say="Senaryo yakında!" />
      <div className="scene-stage" style={{ justifyContent: 'center', gap: 24 }}>
        <Character seed="placeholder-barista" prop={propForRole('barista')} size={96} />
      </div>
      <p className="muted center">Yapay zekâ ile sesli sohbet, kurulum bitince açılacak.</p>
      <Continue onClick={() => onDone({})} />
    </div>
  );
}
