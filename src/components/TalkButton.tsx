import { useEffect, useRef, useState } from 'react';
import { Listener, type HeardResult } from '../lib/voice';

interface Props {
  mode: 'hold' | 'tap';
  onResult: (r: HeardResult) => void;
  disabled?: boolean;
  label?: string;
}

/** Bas-konuş düğmesi. "hold": basılı tut, bırakınca biter. "tap": dokun başlat, dokun bitir. */
export default function TalkButton({ mode, onResult, disabled, label }: Props) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const listener = useRef<Listener | null>(null);

  useEffect(() => () => listener.current?.abort(), []);

  if (!Listener.supported()) {
    return <p className="bad">Bu tarayıcıda ses tanıma yok. Safari kullan.</p>;
  }

  const start = () => {
    if (disabled || listening) return;
    setInterim('');
    listener.current = new Listener(setInterim);
    listener.current.start();
    setListening(true);
  };

  const stop = async () => {
    if (!listening || !listener.current) return;
    setListening(false);
    const r = await listener.current.stop();
    listener.current = null;
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
      <button className={`talk-btn${listening ? ' on' : ''}`} disabled={disabled} {...handlers}>
        {listening ? (mode === 'hold' ? 'Dinliyorum… bırak' : 'Dinliyorum… bitir') : (label ?? (mode === 'hold' ? 'Basılı tut ve konuş' : 'Dokun ve konuş'))}
      </button>
      {listening && <p className="interim">{interim || '…'}</p>}
    </div>
  );
}
