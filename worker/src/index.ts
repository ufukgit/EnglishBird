// EnglishBird Worker — tek kullanıcılı ince ara katman.
//  POST /api/chat          LLM zinciri (Groq → Gemini → OpenRouter → Workers AI)
//  POST /api/transcribe    Ses → metin (Groq Whisper, iPhone B planı)
//  GET/PUT /api/backup     Tüm yerel verinin yedeği (KV)
//  GET  /api/push/key      VAPID genel anahtarı
//  POST /api/push/subscribe Bildirim aboneliğini kaydeder
//  POST /api/session-done  O günün oturumu bitti → kalan hatırlatmalar gönderilmez
//  cron 17–22 UTC          İstanbul 20:00–01:00 saat başı hatırlatma

import { sendEmptyPush, sendEmptyPushDetailed, type Vapid } from './push';

export interface Env {
  STORE: KVNamespace;
  AI: Ai;
  APP_ORIGIN: string;
  APP_SECRET: string;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GROQ_MODEL: string;
  GEMINI_MODEL: string;
  GEMINI_LITE_MODEL: string;
  OPENROUTER_MODEL: string;
  WORKERS_AI_MODEL: string;
  WHISPER_MODEL: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
}

type Purpose = 'turn' | 'analysis' | 'content';

interface ChatRequest {
  purpose?: Purpose;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream?: boolean;
  json?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface Provider {
  name: string;
  call: (req: ChatRequest) => Promise<Response>;
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401, cors);

      const route = `${request.method} ${url.pathname}`;
      switch (route) {
        case 'POST /api/chat':
          return withCors(await chat(env, (await request.json()) as ChatRequest), cors);
        case 'POST /api/transcribe':
          return withCors(await transcribe(env, request), cors);
        case 'GET /api/backup': {
          const data = await env.STORE.get('backup');
          return new Response(data ?? 'null', { headers: { ...cors, 'content-type': 'application/json' } });
        }
        case 'PUT /api/backup': {
          const body = await request.text();
          const prev = await env.STORE.get('backup');
          if (prev) await env.STORE.put('backup-prev', prev);
          await env.STORE.put('backup', body);
          return json({ ok: true, bytes: body.length }, 200, cors);
        }
        case 'GET /api/push/key':
          return json({ key: (await getVapid(env)).publicKey }, 200, cors);
        case 'POST /api/push/test': {
          const sub = await env.STORE.get('push-sub');
          if (!sub) return json({ error: 'no subscription' }, 400, cors);
          const { delay } = (await request.json().catch(() => ({}))) as { delay?: number };
          // Uygulama ön plandayken iOS bildirimi göstermeyebilir: istenirse birkaç saniye bekle.
          if (delay) await scheduler.wait(Math.min(delay, 20) * 1000);
          const r = await sendEmptyPushDetailed(JSON.parse(sub), await getVapid(env));
          return json(r, 200, cors);
        }
        case 'POST /api/push/subscribe': {
          const body = await request.text();
          const sub = JSON.parse(body) as { endpoint?: string };
          if (!sub.endpoint) return json({ error: 'invalid subscription' }, 400, cors);
          await env.STORE.put('push-sub', body);
          return json({ ok: true, host: new URL(sub.endpoint).host }, 200, cors);
        }
        case 'POST /api/session-done': {
          const { date } = (await request.json()) as { date?: string };
          const day = date ?? sessionDay(new Date());
          await env.STORE.put(`done:${day}`, '1', { expirationTtl: 60 * 60 * 48 });
          return json({ ok: true, day }, 200, cors);
        }
        default:
          return json({ error: 'not found' }, 404, cors);
      }
    } catch (e) {
      return json({ error: String((e as Error).message ?? e) }, 500, cors);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const day = sessionDay(new Date());
    if (await env.STORE.get(`done:${day}`)) return;
    const sub = await env.STORE.get('push-sub');
    if (!sub) return;
    const status = await sendEmptyPush(JSON.parse(sub), await getVapid(env));
    if (status === 404 || status === 410) await env.STORE.delete('push-sub');
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// VAPID anahtarları: gizli değişken olarak verilmediyse ilk kullanımda üretilip KV'de saklanır.

async function getVapid(env: Env): Promise<Vapid> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), subject: env.APP_ORIGIN };
  }
  const stored = await env.STORE.get('vapid');
  if (stored) {
    const v = JSON.parse(stored) as { publicKey: string; privateJwk: JsonWebKey };
    return { ...v, subject: env.APP_ORIGIN };
  }
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const privateJwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;
  let bin = '';
  for (const b of raw) bin += String.fromCharCode(b);
  const publicKey = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await env.STORE.put('vapid', JSON.stringify({ publicKey, privateJwk }));
  return { publicKey, privateJwk, subject: env.APP_ORIGIN };
}

// ---------------------------------------------------------------------------
// Oturum günü (İstanbul, UTC+3). 00:00–05:59 arası önceki güne sayılır,
// böylece 00:00 ve 01:00 hatırlatmaları önceki günün oturumuna aittir.

export function sessionDay(now: Date): string {
  const ist = new Date(now.getTime() + 3 * 3600_000);
  if (ist.getUTCHours() < 6) ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// LLM zinciri

function providers(env: Env, purpose: Purpose): Provider[] {
  const groq = env.GROQ_API_KEY
    ? openAiCompatible('groq', 'https://api.groq.com/openai/v1', env.GROQ_API_KEY, env.GROQ_MODEL)
    : null;
  const gemini = env.GEMINI_API_KEY
    ? openAiCompatible(
        'gemini',
        'https://generativelanguage.googleapis.com/v1beta/openai',
        env.GEMINI_API_KEY,
        env.GEMINI_MODEL,
      )
    : null;
  const geminiLite = env.GEMINI_API_KEY
    ? openAiCompatible(
        'gemini-lite',
        'https://generativelanguage.googleapis.com/v1beta/openai',
        env.GEMINI_API_KEY,
        env.GEMINI_LITE_MODEL,
      )
    : null;
  const openrouter = env.OPENROUTER_API_KEY
    ? openAiCompatible('openrouter', 'https://openrouter.ai/api/v1', env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL)
    : null;
  const workersAi = workersAiProvider(env);

  // Analiz: Gemini Flash'ın günlük az sayıdaki isteği burada harcanır.
  const order =
    purpose === 'analysis'
      ? [gemini, groq, geminiLite, openrouter, workersAi]
      : purpose === 'content'
        ? [geminiLite, groq, gemini, openrouter, workersAi]
        : [groq, geminiLite, openrouter, workersAi];
  return order.filter((p): p is Provider => p !== null);
}

function openAiCompatible(name: string, base: string, key: string, model: string): Provider {
  return {
    name,
    call: (req) =>
      fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: req.messages,
          stream: req.stream ?? false,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.max_tokens ?? 700,
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      }),
  };
}

// Workers AI kendi biçimiyle döner; OpenAI biçimine çevrilir. Akış yerine tek parça.
function workersAiProvider(env: Env): Provider {
  return {
    name: 'workers-ai',
    call: async (req) => {
      const out = (await env.AI.run(env.WORKERS_AI_MODEL as keyof AiModels, {
        messages: req.messages,
        max_tokens: req.max_tokens ?? 700,
      } as never)) as { response?: string; choices?: { message?: { content?: string } }[] };
      const content = out.response ?? out.choices?.[0]?.message?.content ?? '';
      if (req.stream) {
        const chunk = JSON.stringify({ choices: [{ delta: { content } }] });
        return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return Response.json({ choices: [{ message: { role: 'assistant', content } }] });
    },
  };
}

async function chat(env: Env, req: ChatRequest): Promise<Response> {
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    return json({ error: 'messages required' }, 400);
  }
  const errors: string[] = [];
  for (const p of providers(env, req.purpose ?? 'turn')) {
    try {
      const res = await p.call(req);
      if (res.ok) {
        const headers = new Headers(res.headers);
        headers.set('x-provider', p.name);
        headers.delete('content-length');
        return new Response(res.body, { status: 200, headers });
      }
      errors.push(`${p.name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      errors.push(`${p.name}: ${String(e)}`);
    }
  }
  return json({ error: 'all providers failed', details: errors }, 502);
}

// Ses → metin. Önce Groq Whisper, olmazsa Workers AI Whisper. Sade bir JSON döner:
// { text, words: [{word, start, end}], noSpeech: 0..1, provider }
async function transcribe(env: Env, request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return json({ error: 'file missing' }, 400);
  const language = (form.get('language') as string) || 'en';
  const errors: string[] = [];

  if (env.GROQ_API_KEY) {
    const out = new FormData();
    out.set('file', file);
    out.set('model', env.WHISPER_MODEL);
    out.set('language', language);
    out.set('response_format', 'verbose_json');
    out.set('temperature', '0');
    out.append('timestamp_granularities[]', 'word');
    out.append('timestamp_granularities[]', 'segment');
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: out,
    });
    if (res.ok) {
      const j = (await res.json()) as {
        text?: string;
        words?: { word: string; start: number; end: number }[];
        segments?: { no_speech_prob?: number }[];
      };
      const probs = (j.segments ?? []).map((x) => x.no_speech_prob ?? 0);
      return json({ text: (j.text ?? '').trim(), words: j.words ?? [], noSpeech: probs.length ? Math.min(...probs) : 1, provider: 'groq' });
    }
    errors.push(`groq: ${res.status} ${(await res.text()).slice(0, 150)}`);
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const out = (await env.AI.run('@cf/openai/whisper-large-v3-turbo' as keyof AiModels, {
      audio: btoa(bin),
      language,
    } as never)) as { text?: string; words?: { word: string; start: number; end: number }[] };
    return json({ text: (out.text ?? '').trim(), words: out.words ?? [], noSpeech: 0, provider: 'workers-ai' });
  } catch (e) {
    errors.push(`workers-ai: ${String(e)}`);
  }
  return json({ error: 'transcription failed', details: errors }, 502);
}

// ---------------------------------------------------------------------------

function authorized(request: Request, env: Env): boolean {
  const h = request.headers.get('authorization') ?? '';
  return !!env.APP_SECRET && h === `Bearer ${env.APP_SECRET}`;
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = origin === env.APP_ORIGIN || origin.startsWith('http://localhost');
  return {
    'access-control-allow-origin': allowed ? origin : env.APP_ORIGIN,
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-expose-headers': 'x-provider',
    vary: 'origin',
  };
}

function withCors(res: Response, cors: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...extra, 'content-type': 'application/json' },
  });
}
