import { useEffect, useRef, useState } from 'react';
import { getPattern, getWord } from '../lib/content';
import { allItems, exportAll, getSettings, importAll, setMeta, type ItemState, type Settings } from '../lib/db';
import { backupToCloud, restoreFromCloud, testWorker } from '../lib/api';
import { speak, type Accent } from '../lib/voice';
import { RUNG_NAMES } from '../lib/types';

export default function Library() {
  const [items, setItems] = useState<ItemState[]>([]);
  const [tab, setTab] = useState<'word' | 'pattern' | 'settings'>('word');
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void (async () => {
      setItems((await allItems()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)));
      setSettings(await getSettings());
    })();
  }, []);

  return (
    <main>
      <h1>Kütüphane</h1>
      <div className="segmented">
        {(['word', 'pattern', 'settings'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {{ word: 'Kelimeler', pattern: 'Kalıplar', settings: 'Ayarlar' }[t]}
          </button>
        ))}
      </div>
      {tab !== 'settings' && <ItemList items={items.filter((i) => i.type === tab)} accent={settings?.accent ?? 'en-US'} />}
      {tab === 'settings' && settings && <SettingsPanel initial={settings} />}
    </main>
  );
}

function ItemList({ items, accent }: { items: ItemState[]; accent: Accent }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <p className="muted">Henüz yok. İlk oturumdan sonra burada görünür.</p>;
  return (
    <div className="list">
      {items.map((it) => {
        const w = getWord(it.id);
        const p = getPattern(it.id);
        const text = w?.text ?? p?.text ?? it.id;
        const due = it.card ? new Date(it.card.due) : null;
        return (
          <div key={it.id} className="list-item" onClick={() => setOpen(open === it.id ? null : it.id)}>
            <div className="row between">
              <span className="big-ish">{text}</span>
              <span className={`rung r${it.rung}`}>{RUNG_NAMES[it.rung]}</span>
            </div>
            {open === it.id && (
              <div className="detail">
                <p className="muted">{w?.tr ?? p?.function}</p>
                {(w?.examples ?? p?.variations ?? []).map((e) => (
                  <p key={e}>
                    <button
                      className="link"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void speak(e.replace(/…/g, ''), { accent });
                      }}
                    >
                      🔊
                    </button>{' '}
                    {e}
                  </p>
                ))}
                {due && <p className="muted small">Sonraki tekrar: {due.toLocaleDateString('tr-TR')}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (next: Settings) => {
    setS(next);
    await setMeta('settings', next);
  };

  const download = async () => {
    const data = JSON.stringify(await exportAll());
    const name = `englishbird-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name }).catch(() => undefined);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
    }
  };

  const upload = async (f: File) => {
    try {
      await importAll(JSON.parse(await f.text()));
      setMsg('Yedek yüklendi. Uygulama yenileniyor…');
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div>
      <h2>Mikrofon</h2>
      <div className="segmented">
        <button aria-pressed={s.micMode === 'hold'} onClick={() => save({ ...s, micMode: 'hold' })}>
          Basılı tut
        </button>
        <button aria-pressed={s.micMode === 'tap'} onClick={() => save({ ...s, micMode: 'tap' })}>
          Dokun başlat/bitir
        </button>
      </div>

      <h2>Ana ses</h2>
      <div className="segmented">
        {(['en-US', 'en-GB', 'en-AU', 'en-IN'] as Accent[]).map((a) => (
          <button key={a} aria-pressed={s.accent === a} onClick={() => save({ ...s, accent: a })}>
            {{ 'en-US': 'ABD', 'en-GB': 'İngiliz', 'en-AU': 'Avustralya', 'en-IN': 'Hint' }[a]}
          </button>
        ))}
      </div>
      <p className="muted small">Ses gelmezse sessiz modu kapat.</p>

      <h2>Yedek</h2>
      <div className="row">
        <button onClick={() => void download()}>Yedeği indir</button>
        <button onClick={() => fileRef.current?.click()}>Yedeği yükle</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </div>

      <h2>Worker</h2>
      <label className="field">
        <span>Adres</span>
        <input value={s.workerUrl} placeholder="https://englishbird-api.….workers.dev" onChange={(e) => void save({ ...s, workerUrl: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span>Gizli anahtar</span>
        <input type="password" value={s.secret} onChange={(e) => void save({ ...s, secret: e.target.value.trim() })} />
      </label>
      <div className="row">
        <button onClick={async () => setMsg(await testWorker())}>Bağlantıyı dene</button>
        <button onClick={async () => setMsg((await backupToCloud()) ? 'Buluta yedeklendi.' : 'Yedeklenemedi.')}>Buluta yedekle</button>
        <button
          onClick={async () => {
            try {
              await importAll(await restoreFromCloud());
              setMsg('Buluttan geri yüklendi. Yenileniyor…');
              setTimeout(() => location.reload(), 800);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Buluttan geri yükle
        </button>
      </div>
      {msg && <p className="card">{msg}</p>}

      <h2>Diğer</h2>
      <button onClick={() => (location.hash = '#/test')}>iPhone ses testi</button>
      <p className="muted small">Sürüm {__BUILD__}</p>
    </div>
  );
}
