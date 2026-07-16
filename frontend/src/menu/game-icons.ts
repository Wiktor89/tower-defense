/** Inline SVG icons — emoji break on LG webOS (monochrome fallbacks). */

const svg = (body: string): string =>
  `<svg class="game-icon" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">${body}</svg>`;

const ICONS: Record<string, string> = {
  'tower-defense': svg(`
    <circle cx="32" cy="36" r="18" fill="#3d8b40"/>
    <circle cx="32" cy="28" r="10" fill="#5cb85c"/>
    <ellipse cx="32" cy="18" rx="8" ry="10" fill="#f4d03f"/>
    <rect x="30" y="44" width="4" height="10" rx="1" fill="#8b5a2b"/>
  `),
  'math-columns': svg(`
    <rect x="10" y="12" width="44" height="40" rx="6" fill="#3498db"/>
    <text x="32" y="40" text-anchor="middle" font-size="22" font-weight="800" fill="#fff" font-family="Segoe UI,sans-serif">+</text>
    <rect x="18" y="18" width="12" height="3" rx="1" fill="#aed6f1"/>
    <rect x="34" y="18" width="12" height="3" rx="1" fill="#aed6f1"/>
  `),
  'fill-blanks': svg(`
    <rect x="12" y="10" width="40" height="44" rx="4" fill="#f5f5f5"/>
    <rect x="18" y="18" width="28" height="3" rx="1" fill="#95a5a6"/>
    <rect x="18" y="28" width="18" height="3" rx="1" fill="#95a5a6"/>
    <rect x="38" y="26" width="10" height="7" rx="2" fill="#e74c3c"/>
    <path d="M44 48l6-10 3 2-6 10z" fill="#f39c12"/>
    <circle cx="49" cy="37" r="2" fill="#c0392b"/>
  `),
  disassemble: svg(`
    <circle cx="32" cy="32" r="20" fill="#7f8c8d"/>
    <circle cx="32" cy="32" r="10" fill="#34495e"/>
    <rect x="29" y="8" width="6" height="14" rx="2" fill="#95a5a6"/>
    <rect x="29" y="42" width="6" height="14" rx="2" fill="#95a5a6"/>
    <rect x="8" y="29" width="14" height="6" rx="2" fill="#95a5a6"/>
    <rect x="42" y="29" width="14" height="6" rx="2" fill="#95a5a6"/>
    <circle cx="32" cy="32" r="4" fill="#ecf0f1"/>
  `),
  fractions: svg(`
    <circle cx="32" cy="32" r="22" fill="#f5c518"/>
    <path d="M32 10 A22 22 0 0 1 54 32 L32 32 Z" fill="#e67e22"/>
    <path d="M32 32 L54 32 A22 22 0 0 1 32 54 Z" fill="#e74c3c"/>
    <circle cx="32" cy="32" r="3" fill="#fff8e7"/>
  `),
  snake: svg(`
    <rect x="8" y="24" width="14" height="14" rx="3" fill="#27ae60"/>
    <rect x="22" y="24" width="14" height="14" rx="3" fill="#2ecc71"/>
    <rect x="36" y="24" width="14" height="14" rx="3" fill="#27ae60"/>
    <rect x="42" y="10" width="14" height="14" rx="3" fill="#2ecc71"/>
    <circle cx="48" cy="15" r="2" fill="#fff"/>
    <circle cx="18" cy="48" r="5" fill="#e74c3c"/>
  `),
  breakout: svg(`
    <rect x="10" y="12" width="14" height="8" rx="2" fill="#e74c3c"/>
    <rect x="26" y="12" width="14" height="8" rx="2" fill="#f39c12"/>
    <rect x="42" y="12" width="12" height="8" rx="2" fill="#3498db"/>
    <rect x="10" y="22" width="14" height="8" rx="2" fill="#9b59b6"/>
    <rect x="26" y="22" width="14" height="8" rx="2" fill="#1abc9c"/>
    <circle cx="32" cy="40" r="5" fill="#ecf0f1"/>
    <rect x="20" y="52" width="24" height="5" rx="2" fill="#bdc3c7"/>
  `),
};

const FALLBACK = svg(`
  <rect x="8" y="8" width="48" height="48" rx="12" fill="#6366f1"/>
  <polygon points="32,16 36,28 48,28 38,36 42,48 32,40 22,48 26,36 16,28 28,28" fill="#fff"/>
`);

export function gameIconHtml(gameId: string): string {
  return ICONS[gameId] ?? FALLBACK;
}
