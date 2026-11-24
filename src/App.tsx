import { useEffect, useState } from 'react';
import SpeechTest from './test/SpeechTest';
import { isStandalone } from './lib/speech';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  if (hash === '#/test') return <SpeechTest />;
  return <Home />;
}

function Home() {
  const installed = isStandalone();
  return (
    <main>
      <h1>EnglishBird</h1>
      <p className="muted">Kullanabildiğin kelime: 0</p>

      {!installed && (
        <div className="card">
          <p className="big">Önce ana ekrana ekle</p>
          <p className="muted">Paylaş düğmesi → Ana Ekrana Ekle. Verilerin böyle korunur.</p>
        </div>
      )}

      <div className="card">
        <p className="big">Aşama 0</p>
        <p className="muted">Günlük oturum Aşama 1'de açılacak. Şimdilik ses testini yap.</p>
      </div>

      <button className="primary" onClick={() => (location.hash = '#/test')}>
        iPhone ses testini başlat
      </button>
    </main>
  );
}
