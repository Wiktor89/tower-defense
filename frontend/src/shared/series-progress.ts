export interface SeriesProgressElements {
  fillEl: HTMLElement;
  markerEl: HTMLElement;
  textEl: HTMLElement;
  sectionEl?: HTMLElement;
}

export function updateSeriesProgress(
  solved: number,
  sessionSize: number,
  elements: SeriesProgressElements,
): void {
  const size = sessionSize > 0 ? sessionSize : 1;
  const capped = Math.min(Math.max(solved, 0), size);
  const pct = Math.min((capped / size) * 100, 100);
  elements.fillEl.style.width = `${pct}%`;
  elements.markerEl.style.left = `${pct}%`;
  elements.textEl.textContent = `${capped} / ${size}`;
  elements.markerEl.classList.toggle('series-marker--active', capped > 0);
  elements.markerEl.classList.toggle('series-marker--max', capped >= size);
  elements.sectionEl?.classList.toggle('progress-section--done', capped >= size);
}
