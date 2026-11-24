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
