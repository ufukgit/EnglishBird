import { useEffect, useRef, useState } from 'react';
import {
  getRecognitionCtor,
  isStandalone,
  loadVoices,
  type Recognition,
  type RecognitionEvent,
} from '../lib/speech';

// iPhone'da Safari'nin ses yeteneklerini ölçen tek sayfalık test.
// Sonuç JSON olarak kopyalanır ve ses tanıma kararı (Safari / Whisper) buna göre verilir.

const SENTENCES = [
  'I think this room is too noisy.',
  'Could you check my reservation, please?',
  'I was wondering if you could help me.',
  'The ship left the west coast on Thursday.',
];

interface RecAttempt {
  target: string;
  mode: 'tek' | 'sürekli' | 'mikrofonla-birlikte';
  final: string;
  alternatives: { transcript: string; confidence: number }[];
  interimCount: number;
  latencyMs: number | null; // konuşma bitişi → nihai sonuç
  durationMs: number;
  error: string | null;
  wordAccuracy: number;
}

interface TtsResult {
  voice: string;
  lang: string;
  rate: number;
  started: boolean;
  boundaryEvents: number;
  error: string | null;
  session: string;
}

interface Env {
  userAgent: string;
  standalone: boolean;
  speechRecognition: boolean;
  speechSynthesis: boolean;
  englishVoices: { name: string; lang: string; local: boolean }[];
  mediaDevices: boolean;
  audioContext: boolean;
  notifications: boolean;
  pushManager: boolean;
  serviceWorker: boolean;
  indexedDB: boolean;
  storagePersisted: boolean | null;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
}

function wordAccuracy(target: string, heard: string) {
  const t = normalize(target);
  const h = new Set(normalize(heard));
  if (!t.length) return 0;
  return Math.round((t.filter((w) => h.has(w)).length / t.length) * 100);
}

// Safari 16.4+ Audio Session API: "playback" sesin sessiz modda da çalmasını sağlar.
type AudioSessionLike = { type: string };
function getAudioSession(): AudioSessionLike | null {
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession ?? null;
}

function beep() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.value = 0.2;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
  osc.onended = () => void ctx.close();
}

// <audio> öğesiyle çalınan bip (Web Audio'dan farklı yol). 16-bit mono WAV üretir.
function mediaBeep(): Promise<string> {
  const rate = 22050, secs = 0.4, n = Math.floor(rate * secs);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3 * 32767, true);
  const audio = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  return audio.play().then(() => 'çaldı', (e) => `hata: ${(e as Error).name}`);
}

export default function SpeechTest() {
  const [env, setEnv] = useState<Env | null>(null);
  const [sentence, setSentence] = useState(0);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [attempts, setAttempts] = useState<RecAttempt[]>([]);
  const [tts, setTts] = useState<TtsResult[]>([]);
  const [level, setLevel] = useState(0);
  const [pauses, setPauses] = useState<number[]>([]);
  const [micError, setMicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sessionType, setSessionType] = useState<string>(() => getAudioSession()?.type ?? 'desteklenmiyor');
  const [beeps, setBeeps] = useState<string[]>([]);

  const recRef = useRef<Recognition | null>(null);
  const micRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    (async () => {
      const v = await loadVoices();
      const en = v.filter((x) => x.lang.toLowerCase().startsWith('en'));
      setVoices(en);
      let persisted: boolean | null = null;
      try {
        persisted = (await navigator.storage?.persisted?.()) ?? null;
      } catch {
        persisted = null;
      }
      setEnv({
        userAgent: navigator.userAgent,
        standalone: isStandalone(),
        speechRecognition: !!getRecognitionCtor(),
        speechSynthesis: 'speechSynthesis' in window,
        englishVoices: en.map((x) => ({ name: x.name, lang: x.lang, local: x.localService })),
        mediaDevices: !!navigator.mediaDevices?.getUserMedia,
        audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
        notifications: 'Notification' in window,
        pushManager: 'PushManager' in window,
        serviceWorker: 'serviceWorker' in navigator,
        indexedDB: 'indexedDB' in window,
        storagePersisted: persisted,
      });
    })();
  }, []);

  // ---------- Mikrofon seviyesi ve duraksama ölçümü (Web Audio) ----------
  async function startMic(): Promise<boolean> {
    if (micRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let raf = 0;
      let silentSince: number | null = null;
      let spoke = false;
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 8));
        const now = performance.now();
        if (rms > 0.02) {
          if (spoke && silentSince !== null && now - silentSince > 250) {
            const ms = Math.round(now - silentSince);
            setPauses((p) => [...p.slice(-19), ms]);
          }
          spoke = true;
          silentSince = null;
        } else if (silentSince === null) {
          silentSince = now;
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
      micRef.current = {
        stop: () => {
          cancelAnimationFrame(raf);
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          setLevel(0);
        },
      };
      setMicError(null);
      return true;
    } catch (e) {
      setMicError(String((e as Error).message ?? e));
      return false;
    }
  }

  function stopMic() {
    micRef.current?.stop();
    micRef.current = null;
  }

  // ---------- Ses tanıma ----------
  async function startRec(mode: RecAttempt['mode']) {
    const Ctor = getRecognitionCtor();
    if (!Ctor || listening) return;
    if (mode === 'mikrofonla-birlikte') {
      setPauses([]);
      if (!(await startMic())) return;
    }
    const target = SENTENCES[sentence];
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = mode === 'sürekli';
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    const t0 = performance.now();
    let speechEnd: number | null = null;
    let interimCount = 0;
    let finalText = '';
    let alts: RecAttempt['alternatives'] = [];
    let error: string | null = null;
    let finalAt: number | null = null;

    rec.onresult = (e: RecognitionEvent) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalText += (finalText ? ' ' : '') + r[0].transcript.trim();
          alts = [];
          for (let j = 0; j < r.length; j++) alts.push({ transcript: r[j].transcript, confidence: r[j].confidence });
          finalAt = performance.now();
        } else {
          interimCount++;
          text += r[0].transcript;
        }
      }
      setInterim(text || finalText);
    };
    rec.onspeechend = () => {
      speechEnd = performance.now();
    };
    rec.onerror = (e) => {
      error = e.error + (e.message ? `: ${e.message}` : '');
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (mode === 'mikrofonla-birlikte') stopMic();
      const end = performance.now();
      setAttempts((a) => [
        ...a,
        {
          target,
          mode,
          final: finalText,
          alternatives: alts,
          interimCount,
          latencyMs: finalAt && speechEnd ? Math.round(finalAt - speechEnd) : null,
          durationMs: Math.round(end - t0),
          error,
          wordAccuracy: wordAccuracy(target, finalText),
        },
      ]);
      setInterim('');
    };

    recRef.current = rec;
    setInterim('');
    setListening(true);
    try {
      rec.start();
    } catch (e) {
      error = String(e);
      setListening(false);
    }
  }

  function stopRec() {
    recRef.current?.stop();
  }

  // ---------- Seslendirme ----------
  function speak(voice: SpeechSynthesisVoice, rate: number) {
    const u = new SpeechSynthesisUtterance(SENTENCES[sentence]);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    const r: TtsResult = { voice: voice.name, lang: voice.lang, rate, started: false, boundaryEvents: 0, error: null, session: getAudioSession()?.type ?? 'yok' };
    u.onstart = () => (r.started = true);
    u.onboundary = () => r.boundaryEvents++;
    u.onerror = (e) => (r.error = e.error);
    u.onend = () => setTts((t) => [...t, { ...r }]);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  async function copyReport() {
    const report = { tarih: new Date().toISOString(), ortam: env, tanima: attempts, seslendirme: tts, bip: beeps, duraksamalarMs: pauses, mikrofonHatasi: micError };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      alert('Kopyalanamadı. Aşağıdaki metni elle seç ve kopyala.');
    }
  }

  const voiceByAccent = ['en-US', 'en-GB', 'en-AU', 'en-IN']
    .map((l) => voices.find((v) => v.lang.replace('_', '-') === l))
    .filter((v): v is SpeechSynthesisVoice => !!v);
  const voiceList = voiceByAccent.length ? voiceByAccent : voices.slice(0, 4);

  return (
    <main>
      <button onClick={() => (location.hash = '')}>← Geri</button>
      <h1>iPhone ses testi</h1>
      <p className="muted">Sonuçları kopyala ve sohbete yapıştır.</p>

      <h2>1. Ortam</h2>
      {env ? (
        <dl className="card kv">
          <dt>Ana ekrandan</dt>
          <dd className={env.standalone ? 'ok' : 'warn'}>{env.standalone ? 'Evet' : 'Hayır — ana ekrandan da test et'}</dd>
          <dt>Ses tanıma</dt>
          <dd className={env.speechRecognition ? 'ok' : 'bad'}>{env.speechRecognition ? 'Var' : 'Yok'}</dd>
          <dt>İngilizce ses</dt>
          <dd>{env.englishVoices.length} adet</dd>
          <dt>Mikrofon</dt>
          <dd>{env.mediaDevices ? 'Var' : 'Yok'}</dd>
          <dt>Bildirim</dt>
          <dd className={env.pushManager ? 'ok' : 'warn'}>{env.pushManager ? 'Destekleniyor' : 'Yok (ana ekrandan aç)'}</dd>
        </dl>
      ) : (
        <p className="muted">Ölçülüyor…</p>
      )}

      <h2>2. Ses tanıma</h2>
      <div className="card">
        <p className="muted">Bu cümleyi oku:</p>
        <p className="big">{SENTENCES[sentence]}</p>
        <div className="row">
          {SENTENCES.map((_, i) => (
            <button key={i} onClick={() => setSentence(i)} disabled={listening} aria-pressed={i === sentence}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {listening ? (
        <button className="primary" onClick={stopRec}>
          Bitir
        </button>
      ) : (
        <div className="row">
          <button className="primary" onClick={() => startRec('tek')}>
            Konuş
          </button>
          <button onClick={() => startRec('sürekli')}>Sürekli mod</button>
          <button onClick={() => startRec('mikrofonla-birlikte')}>Ses ölçümüyle</button>
        </div>
      )}
      {(listening || level > 0) && (
        <div className="meter" style={{ marginTop: 10 }}>
          <div style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      )}
      {interim && <p className="card">{interim}</p>}
      {micError && <p className="bad">Mikrofon: {micError}</p>}

      {attempts.length > 0 && (
        <div className="card">
          {attempts.map((a, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <p>
                <b>{a.mode}</b> · doğruluk %{a.wordAccuracy} · gecikme {a.latencyMs ?? '?'} ms
              </p>
              <p className="muted">“{a.final || '—'}”</p>
              {a.alternatives.length > 0 && (
                <p className="muted" style={{ fontSize: 14 }}>
                  {a.alternatives.length} alternatif · güven {a.alternatives.map((x) => x.confidence.toFixed(2)).join(', ')}
                </p>
              )}
              {a.error && <p className="bad">Hata: {a.error}</p>}
            </div>
          ))}
          {pauses.length > 0 && <p className="muted">Ölçülen duraksamalar: {pauses.join(', ')} ms</p>}
        </div>
      )}

      <h2>3. Seslendirme</h2>
      <div className="card">
        <p className="muted">Ses gelmezse telefonu kulağına götür: mikrofondan sonra iOS sesi ahizeye verebilir.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <button
            onClick={() => {
              beep();
              setBeeps((b) => [...b, getAudioSession()?.type ?? 'yok']);
            }}
          >
            Bip (Web Audio)
          </button>
          <button
            onClick={async () => {
              const r = await mediaBeep();
              setBeeps((b) => [...b, `medya:${getAudioSession()?.type ?? 'yok'}:${r}`]);
            }}
          >
            Bip (medya)
          </button>
          {getAudioSession() &&
            ['auto', 'playback', 'play-and-record'].map((t) => (
              <button
                key={t}
                aria-pressed={sessionType === t}
                onClick={() => {
                  const a = getAudioSession();
                  if (!a) return;
                  try {
                    a.type = t;
                  } catch {
                    /* desteklenmeyen tür */
                  }
                  setSessionType(a.type);
                }}
              >
                {t === sessionType ? '✓ ' : ''}
                {t}
              </button>
            ))}
        </div>
        {voiceList.length === 0 && <p className="muted">İngilizce ses bulunamadı.</p>}
        {voiceList.map((v) => (
          <div key={v.name} className="row" style={{ marginBottom: 6 }}>
            <span style={{ minWidth: 120 }}>
              {v.lang} <span className="muted">{v.name}</span>
            </span>
            {[0.75, 1, 1.25].map((r) => (
              <button key={r} onClick={() => speak(v, r)}>
                {r}×
              </button>
            ))}
          </div>
        ))}
        {tts.length > 0 && (
          <p className="muted" style={{ fontSize: 14 }}>
            Kelime sınırı olayı: {tts.map((t) => t.boundaryEvents).join(', ')}
          </p>
        )}
      </div>

      <h2>4. Sonuç</h2>
      <button className="primary" onClick={copyReport}>
        {copied ? 'Kopyalandı ✓' : 'Sonuçları kopyala'}
      </button>
      <pre>{JSON.stringify({ ortam: env, tanima: attempts, seslendirme: tts, duraksamalarMs: pauses }, null, 2)}</pre>
    </main>
  );
}
