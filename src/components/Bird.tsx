// EnglishBird maskotu. Yönergeleri uzun metin yerine kısa tepkilerle verir.
export type BirdMood = 'idle' | 'happy' | 'sad' | 'listen' | 'talk' | 'think';

interface Props {
  mood?: BirdMood;
  size?: number;
  say?: string;
  side?: 'right' | 'below';
}

export default function Bird({ mood = 'idle', size = 96, say, side = 'right' }: Props) {
  const happy = mood === 'happy';
  const sad = mood === 'sad';
  return (
    <div className={`bird-wrap ${side}`}>
      <svg className={`bird ${mood}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
        {mood === 'listen' && (
          <g className="waves" stroke="var(--primary)" strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M104 40 q8 14 0 28" />
            <path d="M112 32 q14 22 0 44" />
          </g>
        )}
        <ellipse cx="60" cy="112" rx="30" ry="5" fill="var(--shadow)" />
        <g className="bird-body">
          {/* kuyruk */}
          <path d="M18 70 L4 62 L10 78 Z" fill="var(--bird-dark)" />
          {/* gövde */}
          <ellipse cx="58" cy="66" rx="42" ry="40" fill="var(--bird)" />
          <ellipse cx="62" cy="80" rx="26" ry="22" fill="var(--bird-belly)" />
          {/* tepe tüyü */}
          <path d="M52 28 q4 -16 14 -14 q-6 6 -4 14 Z" fill="var(--bird-dark)" />
          {/* kanat */}
          <path className="wing" d="M30 66 q-6 22 18 26 q-4 -14 -18 -26 Z" fill="var(--bird-dark)" />
          {/* göz */}
          {happy ? (
            <path d="M66 50 q7 -8 14 0" stroke="var(--ink)" strokeWidth="4" fill="none" strokeLinecap="round" />
          ) : (
            <>
              <circle cx="73" cy="50" r="10" fill="#fff" />
              <circle className="pupil" cx={mood === 'think' ? 76 : 75} cy={mood === 'think' ? 46 : 51} r="5" fill="var(--ink)" />
              {sad && <path d="M64 38 l16 4" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />}
            </>
          )}
          {/* gaga */}
          <g className={mood === 'talk' ? 'beak talking' : 'beak'}>
            <path d="M92 58 L112 62 L92 66 Z" fill="var(--beak)" />
            <path className="beak-low" d="M92 64 L108 66 L92 70 Z" fill="var(--beak-dark)" />
          </g>
          {/* yanak */}
          <circle cx="82" cy="70" r="5" fill="var(--cheek)" opacity="0.6" />
        </g>
      </svg>
      {say && <div className="bubble">{say}</div>}
    </div>
  );
}
