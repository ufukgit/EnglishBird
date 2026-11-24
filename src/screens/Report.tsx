import { useEffect, useState } from 'react';
import { allItems, allSessions, type SessionRecord } from '../lib/db';
import { formatDuration } from '../lib/day';
import { RUNG_NAMES, type Rung } from '../lib/types';

export default function Report() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [rungs, setRungs] = useState<number[]>([]);

  useEffect(() => {
    void (async () => {
      setSessions((await allSessions()).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
      const items = await allItems();
      setRungs([0, 1, 2, 3, 4, 5, 6].map((r) => items.filter((i) => i.type === 'word' && i.rung === r).length));
    })();
  }, []);

  const last = sessions[0];
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

      <h2>Merdiven</h2>
      <div className="card">
        {([1, 2, 3, 4, 5, 6] as Rung[]).map((r) => (
          <div key={r} className="ladder-row">
            <span>{RUNG_NAMES[r]}</span>
            <span className="bar">
              <span style={{ width: `${Math.min(100, (rungs[r] ?? 0) * 3)}%` }} />
            </span>
            <span className="num">{rungs[r] ?? 0}</span>
          </div>
        ))}
        <p className="muted small">Kullanabildiğin kelime 5. basamakta sayılır: senaryoda kendiliğinden kullanınca.</p>
      </div>

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
