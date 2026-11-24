// Worker üzerinden LLM çağrıları. Akış (SSE) desteklenir; JSON cevabın "reply" alanı
// gelirken parça parça okunur, böylece ilk cümle hemen seslendirilebilir.
import { getSettings } from './db';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type Purpose = 'turn' | 'analysis' | 'content';

async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
  const s = await getSettings();
  if (!s.workerUrl || !s.secret) throw new Error('Worker bağlı değil. Ayarlar → Worker.');
  const res = await fetch(s.workerUrl.replace(/\/$/, '') + '/api/chat', {
    method: 'POST',
    headers: { authorization: `Bearer ${s.secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(res.status === 401 ? 'Worker anahtarı yanlış.' : `Yapay zekâ cevap vermedi (${res.status}). ${t.slice(0, 120)}`);
  }
  return res;
}

/** Tek seferlik çağrı; JSON nesnesi bekler. */
export async function chatJson<T>(messages: ChatMessage[], purpose: Purpose, maxTokens = 700): Promise<T> {
  const res = await post({ messages, purpose, json: true, max_tokens: maxTokens, temperature: purpose === 'analysis' ? 0.2 : 0.7 });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseJsonLoose<T>(data.choices?.[0]?.message?.content ?? '');
}

/** Metinden ilk JSON nesnesini çıkarır (model başına/sonuna yazı eklese bile). */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Yapay zekâ cevabı okunamadı.');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** JSON metnindeki "reply" dizgisinin o ana kadar gelmiş kısmını çözer. */
export function partialReply(raw: string): string {
  const m = raw.match(/"reply"\s*:\s*"/);
  if (!m || m.index === undefined) return '';
  let out = '';
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\') {
      const n = raw[i + 1];
      if (n === undefined) break;
      out += n === 'n' ? ' ' : n === 't' ? ' ' : n === 'u' ? String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16) || 32) : n;
      i += n === 'u' ? 5 : 1;
      continue;
    }
    if (c === '"') break;
    out += c;
  }
  return out;
}

/**
 * Akışlı tur çağrısı. onReply, "reply" alanı büyüdükçe çağrılır. Bitince tam metni döndürür.
 * JSON modu bazı sağlayıcılarda akışla birlikte çalışmadığı için kapalıdır; biçim talimatla istenir.
 */
export async function chatStream(messages: ChatMessage[], onReply: (soFar: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await post({ messages, purpose: 'turn', stream: true, max_tokens: 600, temperature: 0.8 }, signal);
  const reader = res.body?.getReader();
  if (!reader) return '';
  const dec = new TextDecoder();
  let buf = '';
  let raw = '';
  let last = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload) as { choices?: { delta?: { content?: string }; message?: { content?: string } }[] };
        raw += j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
      } catch {
        /* yarım satır */
      }
    }
    const r = partialReply(raw);
    if (r !== last) {
      last = r;
      onReply(r);
    }
  }
  return raw;
}

/** {{alan}} yer tutucularını doldurur. */
export function fill(template: string, vars: Record<string, string | number | undefined>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}
