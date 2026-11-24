// Worker istemcisi. Worker adresi ve gizli anahtar Ayarlar'dan girilir; yoksa sessizce atlanır.
import { exportAll, getSettings } from './db';

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const s = await getSettings();
  if (!s.workerUrl || !s.secret) return null;
  const url = s.workerUrl.replace(/\/$/, '') + path;
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${s.secret}`, 'content-type': 'application/json' },
  });
}

export async function workerConfigured() {
  const s = await getSettings();
  return !!(s.workerUrl && s.secret);
}

/** O günün oturumu bitti: kalan hatırlatmalar gönderilmez. Ardından yedek alınır. */
export async function notifySessionDone(day: string) {
  try {
    await call('/api/session-done', { method: 'POST', body: JSON.stringify({ date: day }) });
    await backupToCloud();
  } catch {
    /* çevrimdışı: sorun değil */
  }
}

export async function backupToCloud(): Promise<boolean> {
  const res = await call('/api/backup', { method: 'PUT', body: JSON.stringify(await exportAll()) });
  return !!res?.ok;
}

export async function restoreFromCloud() {
  const res = await call('/api/backup');
  if (!res?.ok) throw new Error('Bulut yedeği alınamadı.');
  return res.json();
}

export async function testWorker(): Promise<string> {
  try {
    const res = await call('/api/backup');
    if (!res) return 'Adres veya anahtar eksik.';
    if (res.status === 401) return 'Anahtar yanlış.';
    return res.ok ? 'Bağlantı tamam.' : `Hata: ${res.status}`;
  } catch (e) {
    return `Ulaşılamadı: ${(e as Error).message}`;
  }
}

// ---------- Günlük hatırlatma (Web Push) ----------

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function enableReminders(): Promise<string> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'Bildirim yalnızca ana ekrandan açılan uygulamada çalışır.';
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return `Bildirim izni yok (${perm}). iPhone Ayarlar → Bildirimler → EnglishBird.`;
    const keyRes = await call('/api/push/key');
    if (!keyRes?.ok) return `Worker anahtar vermedi (${keyRes?.status ?? 'bağlı değil'}).`;
    const { key } = (await keyRes.json()) as { key: string };
    const reg = await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) as BufferSource });
    const res = await call('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
    if (!res?.ok) return `Abonelik kaydedilemedi (${res?.status}).`;
    const { host } = (await res.json()) as { host?: string };
    return `Hatırlatmalar açık (${host}). 20:00–01:00 saat başı, oturum bitince durur.`;
  } catch (e) {
    return `Hata: ${(e as Error).name}: ${(e as Error).message}`;
  }
}

/** Test bildirimi. delay saniye sonra gönderilir; bu sürede uygulamayı kapat. */
export async function testReminder(delay = 10): Promise<string> {
  try {
    const res = await call('/api/push/test', { method: 'POST', body: JSON.stringify({ delay }) });
    if (!res) return 'Worker bağlı değil.';
    const j = (await res.json().catch(() => ({}))) as { status?: number; body?: string; host?: string; error?: string };
    if (j.error) return 'Önce "Hatırlatmaları aç" düğmesine bas.';
    if (j.status && j.status < 300) return `Gönderildi (${j.host}, ${j.status}). Gelmediyse bana bu satırı yaz.`;
    return `Bildirim sunucusu reddetti: ${j.status} ${j.body ?? ''} (${j.host})`;
  } catch (e) {
    return `Hata: ${(e as Error).message}`;
  }
}
