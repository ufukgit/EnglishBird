import { useEffect, useState } from 'react';
import { allItems, allSessions, getMeta, type SessionRecord } from '../lib/db';
import { formatDuration } from '../lib/day';
import { RUNG_NAMES, type Rung } from '../lib/types';

export default function Report() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [rungs, setRungs] = useState<number[]>([]);
  const [gate, setGate] = useState<{ days: number; blind: { day: string; total: number; correct: number }[] }>({ days: 0, blind: [] });

  useEffect(() => {
    void (async () => {
      setSessions((await allSessions()).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
      setGate({ days: ((await getMeta('doneDays')) ?? []).length, blind: (await getMeta('blindTests')) ?? [] });
      const items = await allItems();
      setRungs([0, 1, 2, 3, 4, 5, 6].map((r) => items.filter((i) => i.type === 'word' && i.rung === r).length));
    })();
  }, []);

  const last = sessions[0];
  const total = rungs.reduce((a, b) => a + b, 0);
  const byDay = new Map<string, SessionRecord[]>();
  for (const s of sessions) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  const days = [...byDay.entries()].slice(0, 14);

  return (
    <main>
      <h1>Rapor</h1>
      {!last ? (
        <p className="muted">Henüz oturum yok.</p>
      ) : (
        <div className="card report">
          <p className="muted small">Son oturum</p>
          {last.reportLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}

      <h2>Aşama 1 hedefi</h2>
      <div className="stats">
        <div className="stat blue">
          <span className="v">{Math.min(gate.days, 14)}/14</span>
          <span className="k">gün kullanım</span>
        </div>
        <div className={`stat ${(() => { const b = gate.blind.at(-1); return b && b.correct / b.total >= 0.7 ? 'mint' : 'sun'; })()}`}>
          <span className="v">
            {gate.blind.length ? `%${Math.round((gate.blind.at(-1)!.correct / gate.blind.at(-1)!.total) * 100)}` : '—'}
          </span>
          <span className="k">son habersiz test (hedef %70)</span>
        </div>
        <div className="stat">
          <span className="v">{gate.blind.length}</span>
          <span className="k">habersiz test</span>
        </div>
      </div>

      <h2>Merdiven</h2>
      <div className="card ladder">
        {([6, 5, 4, 3, 2, 1] as Rung[]).map((r) => (
          <div key={r} className="ladder-row">
            <span className="step-no">{r}</span>
            <span>
              <span className="name">{RUNG_NAMES[r]}</span>
              <span className="bar">
                <span style={{ width: `${Math.min(100, ((rungs[r] ?? 0) / Math.max(1, total)) * 100)}%` }} />
              </span>
            </span>
            <span className="num">{rungs[r] ?? 0}</span>
          </div>
        ))}
      </div>
      <p className="muted small">5. basamak = senaryoda kendiliğinden kullandın.</p>

      {days.length > 0 && (
        <>
          <h2>Son günler</h2>
          <div className="card">
            {days.map(([day, list]) => {
              const ms = list.reduce((n, s) => n + s.speakingMs, 0);
              const rc = list.reduce((n, s) => n + s.recallCorrect, 0);
              const rt = list.reduce((n, s) => n + s.recallTotal, 0);
              return (
                <div key={day} className="day-row">
                  <span>{day.slice(5).split('-').reverse().join('.')}</span>
                  <span>{formatDuration(ms)}</span>
                  <span>
                    {rc}/{rt} hatırlama
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
