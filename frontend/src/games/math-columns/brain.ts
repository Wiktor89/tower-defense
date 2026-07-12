export const DEFAULT_SESSION_SIZE = 50;

const BASE_WRINKLE_THRESHOLDS = [1, 3, 5, 8, 11, 15, 19, 24, 30, 36, 42, 47];

export function wrinkleThresholds(sessionSize: number): number[] {
  const factor = sessionSize / DEFAULT_SESSION_SIZE;
  return BASE_WRINKLE_THRESHOLDS.map(t => Math.max(1, Math.round(t * factor)));
}

export function createBrainSvg(): string {
  const wrinkles = [
    'M12 17 Q16 20 20 17 Q24 14 28 17',
    'M11 22 Q20 26 29 22',
    'M13 27 Q20 24 27 27',
    'M10 15 Q14 12 18 15',
    'M22 15 Q26 12 30 15',
    'M14 20 Q20 23 26 20',
    'M12 25 Q16 28 20 25',
    'M20 25 Q24 28 28 25',
    'M15 14 Q20 16 25 14',
    'M16 29 Q20 31 24 29',
    'M11 19 Q13 16 15 19',
    'M25 19 Q27 16 29 19',
  ];

  const wrinklePaths = wrinkles.map((d, i) =>
    `<path class="brain-wrinkle" data-wrinkle="${i}" d="${d}" opacity="0"/>`
  ).join('');

  return `
    <svg class="brain-svg" viewBox="0 0 40 40" aria-hidden="true">
      <path class="brain-body" d="M20 6
        C13 6 7 11 7 19
        C7 24 9 29 13 32
        C11 33 10 35 11 37
        C13 38 15 36 16 34
        C17 35 18 36 20 36
        C22 36 23 35 24 34
        C25 36 27 38 29 37
        C30 35 29 33 27 32
        C31 29 33 24 33 19
        C33 11 27 6 20 6 Z"/>
      <g class="brain-wrinkles">${wrinklePaths}</g>
    </svg>
  `;
}

export interface BrainProgressElements {
  fillEl: HTMLElement;
  brainEl: HTMLElement;
  textEl: HTMLElement;
  wrinkles: NodeListOf<SVGPathElement>;
}

export function updateBrainProgress(
  solved: number,
  sessionSize: number,
  elements: BrainProgressElements,
): void {
  const { fillEl, brainEl, textEl, wrinkles } = elements;
  const pct = Math.min((solved / sessionSize) * 100, 100);
  const thresholds = wrinkleThresholds(sessionSize);

  fillEl.style.width = `${pct}%`;
  brainEl.style.left = `${pct}%`;
  textEl.textContent = `${solved} / ${sessionSize}`;

  wrinkles.forEach((path, i) => {
    const visible = solved >= (thresholds[i] ?? Infinity);
    path.style.opacity = visible ? String(0.35 + (i / wrinkles.length) * 0.55) : '0';
    path.style.strokeWidth = visible ? String(1.1 + i * 0.08) : '1.1';
  });

  brainEl.classList.toggle('brain--active', solved > 0);
  brainEl.classList.toggle('brain--max', solved >= sessionSize);
}
