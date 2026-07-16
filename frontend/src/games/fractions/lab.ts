import { countSelected, renderPie } from './pie';

export function setupLab(root: {
  panel: HTMLElement;
  pie: HTMLElement;
  frac: HTMLElement;
  partsInput: HTMLInputElement;
  partsVal: HTMLElement;
  openBtns: HTMLElement[];
  closeBtn: HTMLElement;
}): void {
  let selected: boolean[] = [];

  const sync = (): void => {
    const parts = Number(root.partsInput.value);
    root.partsVal.textContent = String(parts);
    if (selected.length !== parts) {
      selected = Array.from({ length: parts }, () => false);
    }
    renderPie(root.pie, {
      parts,
      selected,
      interactive: true,
      size: 200,
      onToggle: (_i, next) => {
        selected = next;
        root.frac.textContent = `${countSelected(selected)}/${parts}`;
      },
    });
    root.frac.textContent = `${countSelected(selected)}/${parts}`;
  };

  const open = (): void => {
    root.panel.classList.remove('hidden');
    sync();
  };
  const close = (): void => root.panel.classList.add('hidden');

  root.partsInput.addEventListener('input', sync);
  root.openBtns.forEach(btn => btn.addEventListener('click', open));
  root.closeBtn.addEventListener('click', close);
  sync();
}
