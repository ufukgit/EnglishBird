import { useEffect, useRef, useState } from 'react';
import { Listener, type HeardResult } from '../lib/voice';
import Icon from './Icon';

interface Props {
  mode: 'hold' | 'tap';
  onResult: (r: HeardResult) => void;
  disabled?: boolean;
  label?: string;
  lang?: string;
}

/** Bas-konuş düğmesi. "hold": basılı tut, bırakınca biter. "tap": dokun başlat, dokun bitir. */
export default function TalkButton({ mode, onResult, disabled, label, lang }: Props) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [denied, setDenied] = useState(false);
  const listener = useRef<Listener | null>(null);

  useEffect(() => () => listener.current?.abort(), []);

  if (!Listener.supported()) {
    return <p className="bad">Bu tarayıcıda ses tanıma yok. Safari kullan.</p>;
  }

  const start = () => {
    if (disabled || listening) return;
    setInterim('');
    listener.current = new Listener(setInterim, lang);
    listener.current.start();
    setListening(true);
  };

  const stop = async () => {
    if (!listening || !listener.current) return;
    setListening(false);
    const r = await listener.current.stop();
    listener.current = null;
    if (r.error === 'not-allowed' || r.error === 'service-not-allowed') {
      setDenied(true);
      return;
    }
    onResult(r);
  };

  const handlers =
    mode === 'hold'
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            start();
          },
          onPointerUp: stop,
          onPointerCancel: stop,
        }
      : { onClick: () => (listening ? stop() : start()) };

  return (
    <div className="talk">
      {listening && <p className="interim">{interim || '…'}</p>}
      <button className={`talk-btn${listening ? ' on' : ''}`} disabled={disabled} aria-label={label ?? 'Konuş'} {...handlers}>
        <Icon name="mic" size={52} stroke={2.2} />
      </button>
      {denied && (
        <p className="help-card small">
          Mikrofon izni yok. iPhone Ayarlar → Uygulamalar → Safari → Mikrofon → <b>İzin Ver</b>. Sonra tekrar dene.
        </p>
      )}
      <span className="talk-label">
        {listening ? (mode === 'hold' ? 'Bırak' : 'Bitir') : (label ?? (mode === 'hold' ? 'Basılı tut' : 'Dokun'))}
      </span>
    </div>
  );
}
