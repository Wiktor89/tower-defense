export interface PieOptions {
  parts: number;
  take?: number;
  selected?: boolean[];
  interactive?: boolean;
  onToggle?: (index: number, selected: boolean[]) => void;
  size?: number;
}

export function renderPie(container: HTMLElement, opts: PieOptions): void {
  const parts = Math.max(2, Math.min(24, opts.parts));
  const size = opts.size ?? 220;
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const selected = opts.selected
    ?? Array.from({ length: parts }, (_, i) => i < (opts.take ?? 0));

  const slices: string[] = [];
  for (let i = 0; i < parts; i++) {
    const a0 = (i / parts) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = parts === 1 ? 1 : 0;
    const fill = selected[i] ? '#f4a261' : '#fef6e8';
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    slices.push(
      `<path class="pie-slice${selected[i] ? ' is-on' : ''}" data-i="${i}" d="${d}" fill="${fill}" stroke="#c4783a" stroke-width="2"/>`,
    );
  }

  container.innerHTML = `
    <svg class="pie-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Пирог из ${parts} частей">
      ${slices.join('')}
      <circle cx="${cx}" cy="${cy}" r="10" fill="#fff7ed" stroke="#c4783a" stroke-width="2"/>
    </svg>
  `;

  if (!opts.interactive || !opts.onToggle) return;

  const state = [...selected];
  container.querySelectorAll<SVGPathElement>('.pie-slice').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const i = Number(el.dataset.i);
      state[i] = !state[i];
      opts.onToggle?.(i, [...state]);
      renderPie(container, { ...opts, selected: state });
    });
  });
}

export function countSelected(selected: boolean[]): number {
  return selected.filter(Boolean).length;
}
