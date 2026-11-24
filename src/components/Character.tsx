// Senaryo ve sahne karakterleri: rol adından türetilen, her seferinde aynı görünen basit figürler.
const SKIN = ['#F1C7A5', '#E0A981', '#C68A62', '#8D5A3B', '#FAD9BE'];
const HAIR = ['#2E2A28', '#6B4226', '#C9873A', '#D9D2C5', '#8A2E1F'];
const SHIRT = ['#2F80ED', '#FF6B57', '#2ECC8F', '#9B6BFF', '#FFB020', '#16B5C9'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

export type Prop = 'apron' | 'tie' | 'headset' | 'cap' | 'none';

export function propForRole(role: string): Prop {
  const r = role.toLowerCase();
  if (/barista|garson|waiter|aşçı|kasiyer/.test(r)) return 'apron';
  if (/yönetici|manager|banka|işe alım|resepsiyon|görevli/.test(r)) return 'tie';
  if (/çağrı|telefon|temsilci|müşteri hizmet|operatör/.test(r)) return 'headset';
  if (/şoför|kargo|tesisat/.test(r)) return 'cap';
  return 'none';
}

interface Props {
  seed: string;
  prop?: Prop;
  talking?: boolean;
  size?: number;
  flip?: boolean;
  mood?: 'neutral' | 'happy' | 'annoyed';
}

export default function Character({ seed, prop = 'none', talking, size = 88, flip, mood = 'neutral' }: Props) {
  const h = hash(seed);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const shirt = SHIRT[(h >> 6) % SHIRT.length];
  const style = (h >> 9) % 4; // saç biçimi
  return (
    <svg
      className={`character${talking ? ' talking' : ''}`}
      width={size}
      height={size * 1.15}
      viewBox="0 0 100 115"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
    >
      <ellipse cx="50" cy="111" rx="30" ry="4" fill="var(--shadow)" />
      {/* gövde */}
      <path d="M18 112 q0 -38 32 -38 q32 0 32 38 Z" fill={shirt} />
      {prop === 'apron' && <path d="M36 82 h28 v30 h-28 Z" fill="#fff" opacity="0.9" />}
      {prop === 'tie' && <path d="M50 78 l5 8 l-5 22 l-5 -22 Z" fill="#1d2b44" />}
      {/* boyun ve baş */}
      <rect x="44" y="64" width="12" height="14" rx="5" fill={skin} />
      <circle cx="50" cy="44" r="24" fill={skin} />
      {/* saç */}
      {style === 0 && <path d="M26 42 q2 -24 24 -24 q22 0 24 24 q-10 -10 -24 -10 q-14 0 -24 10 Z" fill={hair} />}
      {style === 1 && (
        <>
          <path d="M26 44 q0 -26 24 -26 q24 0 24 26 q-6 -14 -24 -14 q-18 0 -24 14 Z" fill={hair} />
          <circle cx="50" cy="16" r="9" fill={hair} />
        </>
      )}
      {style === 2 && <path d="M24 50 q-4 -32 26 -32 q30 0 26 32 q-2 -20 -26 -20 q-24 0 -26 20 Z" fill={hair} />}
      {style === 3 && <path d="M28 36 q8 -18 22 -18 q14 0 22 18 Z" fill={hair} />}
      {prop === 'cap' && <path d="M24 36 q4 -20 26 -20 q22 0 26 20 Z M70 34 h16 v5 h-18 Z" fill="#FF6B57" />}
      {/* yüz */}
      <circle cx="41" cy="44" r="3" fill="#2b2b2b" />
      <circle cx="59" cy="44" r="3" fill="#2b2b2b" />
      {mood === 'annoyed' && <path d="M36 37 l9 3 M64 37 l-9 3" stroke="#2b2b2b" strokeWidth="2.5" strokeLinecap="round" />}
      <ellipse className="mouth" cx="50" cy="56" rx={mood === 'happy' ? 7 : 5} ry={talking ? 4 : 2} fill="#7a3b2e" />
      {prop === 'headset' && (
        <>
          <path d="M26 44 q0 -28 24 -28 q24 0 24 28" stroke="#1d2b44" strokeWidth="4" fill="none" />
          <rect x="22" y="40" width="8" height="12" rx="3" fill="#1d2b44" />
          <path d="M26 52 q4 10 16 8" stroke="#1d2b44" strokeWidth="3" fill="none" />
        </>
      )}
    </svg>
  );
}
