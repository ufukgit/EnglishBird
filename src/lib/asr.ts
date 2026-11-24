// Ses tanıma motoru seçimi: Whisper (Worker üzerinden, asıl) veya Safari (yedek).
import { WhisperListener } from './recorder';
import { Listener, type HeardResult } from './voice';

export type AsrEngine = 'whisper' | 'safari';

export interface ListenerLike {
  start(): void;
  stop(): Promise<HeardResult>;
  abort(): void;
}

let engine: AsrEngine = 'safari';

export function setAsrEngine(e: AsrEngine) {
  engine = e;
}

export function currentAsrEngine(): AsrEngine {
  return engine === 'whisper' && WhisperListener.supported() ? 'whisper' : 'safari';
}

export function createListener(onInterim: (t: string) => void, lang?: string): ListenerLike {
  return currentAsrEngine() === 'whisper' ? new WhisperListener(onInterim, lang) : new Listener(onInterim, lang);
}

export function asrSupported() {
  return WhisperListener.supported() || Listener.supported();
}
