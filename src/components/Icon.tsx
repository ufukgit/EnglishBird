// Basit çizgi ikonlar (metin yerine).
const PATHS: Record<string, string> = {
  home: 'M3 11 L12 3 L21 11 M5 9.5 V21 H19 V9.5',
  chart: 'M4 20 V10 M10 20 V4 M16 20 V13 M22 20 H2',
  book: 'M4 4 H10 a2 2 0 0 1 2 2 V20 a2 2 0 0 0 -2 -2 H4 Z M20 4 H14 a2 2 0 0 0 -2 2 V20 a2 2 0 0 1 2 -2 H20 Z',
  speaker: 'M4 9 H8 L13 5 V19 L8 15 H4 Z M16 9 a4 4 0 0 1 0 6 M18.5 6.5 a7.5 7.5 0 0 1 0 11',
  mic: 'M12 3 a3 3 0 0 1 3 3 V12 a3 3 0 0 1 -6 0 V6 a3 3 0 0 1 3 -3 Z M5 11 a7 7 0 0 0 14 0 M12 18 V22',
  close: 'M5 5 L19 19 M19 5 L5 19',
  check: 'M4 12 L10 18 L20 6',
  bolt: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
  gear: 'M12 8 a4 4 0 1 0 0.01 0 Z M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9',
  play: 'M7 4 L20 12 L7 20 Z',
  snail: 'M3 18 H19 a3 3 0 0 0 0 -6 a5 5 0 1 0 -10 0 V18 M19 12 L21 8 M17 11 L18 7',
  bulb: 'M9 18 H15 M10 21 H14 M12 3 a6 6 0 0 0 -4 10.5 V16 H16 V13.5 A6 6 0 0 0 12 3 Z',
  flag: 'M5 21 V4 H17 L15 8 L17 12 H5',
  clock: 'M12 3 a9 9 0 1 0 0.01 0 Z M12 7 V12 L15 14',
  brain: 'M9 4 a3 3 0 0 0 -3 3 a3 3 0 0 0 -2 5 a3 3 0 0 0 2 5 a3 3 0 0 0 6 1 V5 a2 2 0 0 0 -3 -1 Z M15 4 a3 3 0 0 1 3 3 a3 3 0 0 1 2 5 a3 3 0 0 1 -2 5 a3 3 0 0 1 -6 1',
  up: 'M12 20 V5 M6 11 L12 5 L18 11',
};

export default function Icon({ name, size = 24, stroke = 2.4 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
