import { useEffect, useState } from 'react';
import { getPattern } from '../lib/content';
import { allItems, allSessions, getMeta } from '../lib/db';
import { sessionDay } from '../lib/day';
import { dueItems, getTodayPlan } from '../lib/srs';
import { isStandalone } from '../lib/speech';

interface HomeData {
  usable: number;
  pattern: string;
  patternFn: string;
  doneToday: boolean;
  remainingNew: number;
  due: number;
  focus: string | null;
  reducedLoad: boolean;
}

export default function Home({ start }: { start: (kind: 'quick' | 'deep' | 'extra') => void }) {
  const [d, setD] = useState<HomeData | null>(null);

  useEffect(() => {
    void (async () => {
      const plan = await getTodayPlan();
      const items = await allItems();
      const sessions = await allSessions();
      const done = (await getMeta('doneDays')) ?? [];
      const last = sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
      const p = getPattern(plan.patternId);
      setD({
        usable: items.filter((i) => i.rung >= 5).length,
        pattern: p?.text ?? '',
        patternFn: p?.function ?? '',
        doneToday: done.includes(sessionDay()),
        remainingNew: plan.newIds.filter((id) => !plan.introduced.includes(id)).length,
        due: (await dueItems()).length,
        focus: last?.reportLines.find((l) => l.startsWith('Yarın')) ?? null,
        reducedLoad: plan.reducedLoad,
      });
    })();
  }, []);

  if (!d) return null;

  return (
    <main>
      {!isStandalone() && (
        <div className="card warn-card">
          <p className="big">Önce ana ekrana ekle</p>
          <p className="muted">Paylaş → Ana Ekrana Ekle. Verilerin böyle korunur.</p>
        </div>
      )}

      <p className="status">Kullanabildiğin kelime: {d.usable}</p>

      <div className="card">
        <p className="muted small">Bugünün kalıbı</p>
        <p className="big">{d.pattern}</p>
        <p className="muted small">{d.patternFn}</p>
      </div>

      {d.focus && !d.doneToday && <p className="muted">{d.focus}</p>}
      {d.reducedLoad && <p className="muted small">Bekleyen tekrar çok: bugün 5 yeni öğe.</p>}

      {d.doneToday ? (
        <>
          <p className="ok big">Bugünün oturumu tamam.</p>
          <button className="primary" onClick={() => start('extra')}>
            {d.remainingNew > 0 ? `Kalan ${d.remainingNew} öğeyi çalış` : 'Ekstra pratik'}
          </button>
        </>
      ) : (
        <div className="start">
          <button className="primary" onClick={() => start('deep')}>
            Bugünü başlat · Derin
            <span>15–20 dk</span>
          </button>
          <button className="secondary" onClick={() => start('quick')}>
            Hızlı · 5 dk
          </button>
        </div>
      )}
      <p className="muted small center">{d.due} tekrar · {d.remainingNew} yeni öğe</p>
    </main>
  );
}
