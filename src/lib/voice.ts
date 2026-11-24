// Seslendirme (iOS speechSynthesis) ve ses tanıma (Safari webkitSpeechRecognition).
import { getRecognitionCtor, loadVoices, type Recognition, type RecognitionEvent } from './speech';

export type Accent = 'en-US' | 'en-GB' | 'en-AU' | 'en-IN';

// iOS'taki eğlence sesleri
const NOVELTY = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Wobble', 'Fred', 'Good News', 'Jester',
  'Junior', 'Kathy', 'Organ', 'Superstar', 'Ralph', 'Trinoids', 'Whisper', 'Zarvox',
]);
const PREFERRED: Record<Accent, string[]> = {
  'en-US': ['Samantha', 'Ava', 'Allison', 'Susan', 'Tom', 'Evan', 'Nathan', 'Zoe'],
  'en-GB': ['Daniel', 'Kate', 'Serena', 'Arthur', 'Martha', 'Oliver'],
  'en-AU': ['Karen', 'Lee', 'Matilda', 'Catherine'],
  'en-IN': ['Rishi', 'Veena', 'Isha', 'Sangeeta'],
};

let voicesCache: SpeechSynthesisVoice[] | null = null;

export async function englishVoices(): Promise<SpeechSynthesisVoice[]> {
  voicesCache ??= (await loadVoices()).filter((v) => v.lang.replace('_', '-').startsWith('en') && !NOVELTY.has(v.name));
  return voicesCache;
}

/** Aksan için en iyi ses: "Gelişmiş/Premium" sürüm varsa onu seçer. */
export async function pickVoice(accent: Accent, avoid?: string): Promise<SpeechSynthesisVoice | null> {
  const list = (await englishVoices()).filter((v) => v.lang.replace('_', '-') === accent && v.name !== avoid);
  const score = (v: SpeechSynthesisVoice) => {
    const base = PREFERRED[accent].findIndex((n) => v.name.startsWith(n));
    const quality = /premium|enhanced|gelişmiş/i.test(v.name) || /premium|enhanced/i.test(v.voiceURI) ? -100 : 0;
    return (base === -1 ? 50 : base) + quality;
  };
  return list.sort((a, b) => score(a) - score(b))[0] ?? (await englishVoices())[0] ?? null;
}

export interface SpeakOptions {
  accent?: Accent;
  rate?: number;
  voice?: SpeechSynthesisVoice | null;
  onWord?: (charIndex: number) => void;
}

/** Metni seslendirir; bitince çözülür. iOS'ta sessiz düğmesi açıksa ses çıkmaz. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!('speechSynthesis' in window)) return;
  const voice = opts.voice ?? (await pickVoice(opts.accent ?? 'en-US'));
  return new Promise((resolve) => {
    // Güvenlik: bazı durumlarda onend hiç gelmez; tahmini süre sonunda yine de devam et.
    const words = text.split(/\s+/).length;
    const timer = setTimeout(resolve, (words * 450) / (opts.rate ?? 1) + 2500);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? opts.accent ?? 'en-US';
    u.rate = opts.rate ?? 1;
    u.volume = 1;
    if (opts.onWord) u.onboundary = (e) => opts.onWord!(e.charIndex);
    u.onend = done;
    u.onerror = done;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// ---------------------------------------------------------------------------
// Ses tanıma: sürekli mod + bas-konuş. Safari "no-speech" ile erken kapanırsa,
// kullanıcı hâlâ basılı tutuyorsa otomatik yeniden başlatılır.

export interface HeardResult {
  transcript: string;
  confidence: number | null;
  durationMs: number;
  error: string | null;
}

export class Listener {
  private rec: Recognition | null = null;
  private finals: string[] = [];
  private confidences: number[] = [];
  private interim = '';
  private active = false;
  private restarts = 0;
  private startedAt = 0;
  private lastError: string | null = null;
  private endWaiter: (() => void) | null = null;

  constructor(
    private onInterim: (text: string) => void,
    private lang = 'en-US',
  ) {}

  static supported() {
    return !!getRecognitionCtor();
  }

  start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor || this.active) return;
    stopSpeaking();
    this.active = true;
    this.finals = [];
    this.confidences = [];
    this.interim = '';
    this.restarts = 0;
    this.lastError = null;
    this.startedAt = performance.now();
    this.spawn(Ctor);
  }

  private spawn(Ctor: NonNullable<ReturnType<typeof getRecognitionCtor>>) {
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: RecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          this.finals.push(r[0].transcript.trim());
          if (r[0].confidence > 0) this.confidences.push(r[0].confidence);
        } else interim += r[0].transcript;
      }
      this.interim = interim.trim();
      this.onInterim(this.text());
    };
    rec.onerror = (e) => {
      this.lastError = e.error;
    };
    rec.onend = () => {
      // Safari sessizlikte kendiliğinden kapanabilir; basılı tutuluyorsa yeniden başlat.
      if (this.active && this.restarts < 5) {
        this.restarts++;
        if (this.interim) {
          this.finals.push(this.interim);
          this.interim = '';
        }
        try {
          this.spawn(Ctor);
          return;
        } catch {
          /* aşağıda bitir */
        }
      }
      this.rec = null;
      this.endWaiter?.();
    };
    this.rec = rec;
    rec.start();
  }

  private text() {
    return [...this.finals, this.interim].filter(Boolean).join(' ').trim();
  }

  /** Bırakıldığında: son sonucu bekler (en fazla 1,2 sn) ve döndürür. */
  async stop(): Promise<HeardResult> {
    const durationMs = Math.round(performance.now() - this.startedAt);
    this.active = false;
    if (this.rec) {
      await new Promise<void>((resolve) => {
        this.endWaiter = resolve;
        try {
          this.rec!.stop();
        } catch {
          resolve();
        }
        setTimeout(resolve, 1200);
      });
    }
    this.endWaiter = null;
    const transcript = this.text();
    const confidence = this.confidences.length
      ? this.confidences.reduce((a, b) => a + b, 0) / this.confidences.length
      : null;
    return { transcript, confidence, durationMs, error: transcript ? null : this.lastError };
  }

  abort() {
    this.active = false;
    try {
      this.rec?.abort();
    } catch {
      /* yok say */
    }
    this.rec = null;
  }
}
