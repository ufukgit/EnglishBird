import { useEffect, useState } from 'react';
import { getPattern } from '../lib/content';
import { allItems, allSessions, getMeta } from '../lib/db';
import { sessionDay } from '../lib/day';
import { dueItems, getTodayPlan } from '../lib/srs';
import { isStandalone } from '../lib/speech';
import Bird from '../components/Bird';
import Icon from '../components/Icon';

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
          <b>Önce ana ekrana ekle:</b> Paylaş → Ana Ekrana Ekle
        </div>
      )}

      <div className="home-top">
        <span className="pill mint" title="Kullanabildiğin kelime">
          <Icon name="mic" size={18} /> {d.usable} kelime
        </span>
        <span className="pill sun">
          <Icon name="bolt" size={18} /> {d.due} tekrar
        </span>
      </div>

      <div className="hero">
        <Bird mood={d.doneToday ? 'happy' : 'idle'} size={112} say={d.doneToday ? 'Bugün tamam!' : 'Hazır mısın?'} />
      </div>

      <div className="pattern-card">
        <div className="label">Günün kalıbı</div>
        <div className="text">{d.pattern}</div>
        <div className="fn">{d.patternFn}</div>
      </div>

      {d.reducedLoad && <p className="muted small center">Çok tekrar birikti: bugün 5 yeni kelime.</p>}

      {d.doneToday ? (
        <div className="start">
          <button className="primary" onClick={() => start('extra')}>
            {d.remainingNew > 0 ? `+${d.remainingNew} kelime` : 'Ekstra pratik'}
          </button>
        </div>
      ) : (
        <div className="mode-row" style={{ marginTop: 14 }}>
          <button className="mode deep" onClick={() => start('deep')}>
            <Icon name="play" size={30} />
            Derin
            <small>15–20 dk</small>
          </button>
          <button className="mode" onClick={() => start('quick')}>
            <Icon name="bolt" size={30} />
            Hızlı
            <small>5 dk</small>
          </button>
        </div>
      )}
      {d.focus && !d.doneToday && <p className="muted small center">{d.focus}</p>}
    </main>
  );
}
