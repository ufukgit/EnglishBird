// Oturum günü: gece 06:00'ya kadar önceki güne sayılır (Worker'daki sessionDay ile aynı kural).
export function sessionDay(d = new Date()): string {
  const x = new Date(d);
  if (x.getHours() < 6) x.setDate(x.getDate() - 1);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

/** Günün sonu (ertesi gün 06:00) — vadesi bugün olan tekrarlar için sınır */
export function endOfSessionDay(d = new Date()): Date {
  const [y, m, day] = sessionDay(d).split('-').map(Number);
  return new Date(y, m - 1, day + 1, 6, 0, 0);
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} dk ${s % 60} sn` : `${s} sn`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
