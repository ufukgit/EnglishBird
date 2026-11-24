import { useEffect, useState } from 'react';
import SpeechTest from './test/SpeechTest';
import Home from './screens/Home';
import Session from './screens/Session';
import Report from './screens/Report';
import Library from './screens/Library';
import Icon from './components/Icon';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const go = (h: string) => (location.hash = h);

export default function App() {
  const hash = useHash();

  useEffect(() => {
    // iOS'un verileri silmemesi için kalıcı depolama iste (ana ekrandan açıldığında genelde verilir).
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  if (hash === '#/test') return <SpeechTest />;
  const sessionMatch = hash.match(/^#\/session\/(quick|deep|extra)$/);
  if (sessionMatch) return <Session kind={sessionMatch[1] as 'quick' | 'deep' | 'extra'} onExit={() => go('#/')} />;

  const tab = hash === '#/report' ? 'report' : hash === '#/library' ? 'library' : 'home';
  return (
    <>
      <div className="page">
        {tab === 'home' && <Home start={(k) => go(`#/session/${k}`)} />}
        {tab === 'report' && <Report />}
        {tab === 'library' && <Library />}
      </div>
      <nav className="tabs">
        <button aria-pressed={tab === 'home'} onClick={() => go('#/')}>
          <Icon name="home" size={26} />
          Ana
        </button>
        <button aria-pressed={tab === 'report'} onClick={() => go('#/report')}>
          <Icon name="chart" size={26} />
          Rapor
        </button>
        <button aria-pressed={tab === 'library'} onClick={() => go('#/library')}>
          <Icon name="book" size={26} />
          Kütüphane
        </button>
      </nav>
    </>
  );
}
