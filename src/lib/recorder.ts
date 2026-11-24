// Whisper ile ses tanıma: ses uygulamada kaydedilir (MediaRecorder), Worker üzerinden
// Whisper'a gönderilir. Safari'nin ses tanıması iOS'ta ses çaldıktan sonra sessiz kalabildiği
// için asıl yöntem budur.
import { getSettings } from './db';
import { stopSpeaking, type HeardResult } from './voice';

// Whisper'ın sessizlikte uydurduğu tipik cümleler
const HALLUCINATIONS = new Set(['thank you.', 'thank you', 'thanks for watching.', 'you', 'bye.', 'bye', '.', 'thank you for watching.']);

function pickMime(): { mime: string; ext: string } {
  const cands = [
    { mime: 'audio/mp4', ext: 'm4a' },
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
  ];
  for (const c of cands) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c.mime)) return c;
  return { mime: '', ext: 'm4a' };
}

export class WhisperListener {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private starting: Promise<void> | null = null;
  private error: string | null = null;

  constructor(
    private onInterim: (text: string) => void,
    private lang = 'en-US',
  ) {}

  static supported() {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  start() {
    stopSpeaking();
    this.chunks = [];
    this.error = null;
    this.startedAt = performance.now();
    this.onInterim('');
    this.starting = (async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const { mime } = pickMime();
        this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
        this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
        this.recorder.start(250);
      } catch (e) {
        this.error = (e as Error).name === 'NotAllowedError' ? 'not-allowed' : (e as Error).message;
      }
    })();
  }

  async stop(): Promise<HeardResult> {
    await this.starting;
    const durationMs = Math.round(performance.now() - this.startedAt);
    const rec = this.recorder;
    if (!rec) {
      this.release();
      return { transcript: '', confidence: null, durationMs, error: this.error ?? 'no-recorder' };
    }
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
      setTimeout(resolve, 1500);
    });
    const type = rec.mimeType || pickMime().mime || 'audio/mp4';
    this.release();
    const blob = new Blob(this.chunks, { type });
    if (blob.size < 1500 || durationMs < 400) return { transcript: '', confidence: null, durationMs, error: 'too-short' };
    return this.transcribe(blob, durationMs);
  }

  private async transcribe(blob: Blob, durationMs: number): Promise<HeardResult> {
    try {
      const s = await getSettings();
      const form = new FormData();
      const ext = blob.type.includes('webm') ? 'webm' : 'm4a';
      form.set('file', blob, `speech.${ext}`);
      form.set('language', this.lang.slice(0, 2));
      const res = await fetch(s.workerUrl.replace(/\/$/, '') + '/api/transcribe', {
        method: 'POST',
        headers: { authorization: `Bearer ${s.secret}` },
        body: form,
      });
      if (!res.ok) return { transcript: '', confidence: null, durationMs, error: `transcribe-${res.status}` };
      const j = (await res.json()) as { text?: string; noSpeech?: number };
      let text = (j.text ?? '').trim();
      if ((j.noSpeech ?? 0) > 0.7 || HALLUCINATIONS.has(text.toLowerCase())) text = '';
      return { transcript: text, confidence: j.noSpeech !== undefined ? 1 - j.noSpeech : null, durationMs, error: text ? null : 'no-speech' };
    } catch (e) {
      return { transcript: '', confidence: null, durationMs, error: (e as Error).message };
    }
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  abort() {
    try {
      this.recorder?.stop();
    } catch {
      /* yok say */
    }
    this.release();
  }
}
