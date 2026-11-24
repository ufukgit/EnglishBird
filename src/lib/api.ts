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
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Bildirim yalnızca ana ekrandan açılan uygulamada çalışır.';
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Bildirim izni verilmedi. Ayarlar → Bildirimler → EnglishBird.';
  const keyRes = await call('/api/push/key');
  if (!keyRes?.ok) return 'Önce Worker bağlantısını kur.';
  const { key } = (await keyRes.json()) as { key: string };
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) as BufferSource });
  const res = await call('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
  return res?.ok ? 'Hatırlatmalar açık: 20:00–01:00 saat başı, oturum bitince durur.' : 'Abonelik kaydedilemedi.';
}

export async function testReminder(): Promise<string> {
  const res = await call('/api/push/test', { method: 'POST' });
  if (!res) return 'Worker bağlı değil.';
  const j = (await res.json().catch(() => ({}))) as { status?: number; error?: string };
  if (j.error) return 'Önce hatırlatmaları aç.';
  return j.status && j.status < 300 ? 'Test bildirimi gönderildi.' : `Gönderilemedi (${j.status}).`;
}
