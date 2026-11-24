// Ses efektleri: dosya yok, Web Audio ile üretilir. Ayarlardan kapatılabilir.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSfxEnabled(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new Ctx();
    if (ctx.state !== 'running') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
  scheduleSuspend();
}

// Ses tanımayla çakışmaması için ses motoru boşta kalınca askıya alınır.
let suspendTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSuspend() {
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => void ctx?.suspend(), 1500);
}

export const sfx = {
  tap: () => tone(1400, 0, 0.05, 'triangle', 0.05),
  correct: () => {
    tone(784, 0, 0.12, 'sine', 0.16);
    tone(1175, 0.09, 0.22, 'sine', 0.16);
  },
  wrong: () => tone(260, 0, 0.28, 'triangle', 0.14, 170),
  micOn: () => tone(880, 0, 0.07, 'sine', 0.08),
  micOff: () => tone(620, 0, 0.07, 'sine', 0.08),
  finish: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.25, 'sine', 0.14)),
  step: () => tone(1046, 0, 0.06, 'sine', 0.05),
};
