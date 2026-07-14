import './style.css';
import { ensureUserLogin } from '../../shared/login';
import { AssemblyGame, type GameMode } from './AssemblyGame';
import { PARTS, type PartId } from './parts';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const statusText = document.getElementById('status-text');
const hintText = document.getElementById('hint-text');
const winBanner = document.getElementById('win-banner');
const disassembleBtn = document.getElementById('disassemble-btn') as HTMLButtonElement | null;
const clearBtn = document.getElementById('assemble-hint-btn') as HTMLButtonElement | null;
const legend = document.getElementById('parts-legend');

if (!canvas || !statusText || !hintText || !winBanner || !disassembleBtn || !clearBtn || !legend) {
  throw new Error('Missing DOM elements');
}

const ui = { canvas, statusText, hintText, winBanner, disassembleBtn, clearBtn, legend };

const game = new AssemblyGame(ui.canvas);

let audioCtx: AudioContext | null = null;

function playRejectBeep(): void {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // ignore audio failures
  }
}

function flashReject(): void {
  ui.statusText.classList.add('status-reject');
  window.setTimeout(() => ui.statusText.classList.remove('status-reject'), 450);
}

function renderLegend(selected: PartId | null, mode: GameMode): void {
  ui.legend.innerHTML = PARTS.map(p => {
    const classes = ['part-chip'];
    if (selected === p.id) classes.push('selected');
    return `<button type="button" class="${classes.join(' ')}" data-id="${p.id}"
      ${mode !== 'exploded' ? 'disabled' : ''}
      style="background:${'#' + p.color.toString(16).padStart(6, '0')}22">${p.name}</button>`;
  }).join('');

  ui.legend.querySelectorAll<HTMLButtonElement>('.part-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id as PartId;
      game.selectPart(id);
    });
  });
}

function syncUi(mode: GameMode, selected: PartId | null): void {
  renderLegend(selected, mode);

  if (mode === 'assembled') {
    ui.statusText.textContent = 'Покрутите ручку, затем нажмите «Разобрать»';
    ui.hintText.textContent = 'ЛКМ по фону или колёсико — осмотреть предмет';
    ui.disassembleBtn.disabled = false;
    ui.disassembleBtn.textContent = 'Разобрать';
    ui.clearBtn.classList.add('hidden');
    ui.winBanner.classList.add('hidden');
  } else if (mode === 'exploded') {
    ui.statusText.textContent = selected
      ? `Взято: ${PARTS.find(p => p.id === selected)?.name}. Перетащите стрелкой к нужной детали`
      : 'Перетащите деталь к той, на которую указывает стрелка';
    ui.hintText.textContent =
      'Зажмите деталь ЛКМ и крутите колёсиком. Стрелки показывают, куда вставлять.';
    ui.disassembleBtn.disabled = true;
    ui.clearBtn.classList.toggle('hidden', !selected);
    ui.winBanner.classList.add('hidden');
  } else {
    ui.statusText.textContent = 'Предмет полностью собран';
    ui.hintText.textContent = 'Можно снова нажать «Разобрать»';
    ui.disassembleBtn.disabled = false;
    ui.disassembleBtn.textContent = 'Разобрать';
    ui.clearBtn.classList.add('hidden');
    ui.winBanner.classList.remove('hidden');
  }
}

game.onModeChange = syncUi;
game.onSelect = id => syncUi(game.getMode(), id);
game.onWrongPair = () => {
  playRejectBeep();
  flashReject();
  ui.statusText.textContent = 'Недопустимо';
};
game.onJoined = (a, b) => {
  const na = PARTS.find(p => p.id === a)?.name;
  const nb = PARTS.find(p => p.id === b)?.name;
  ui.statusText.textContent = `Соединено: ${na} + ${nb}`;
};

ui.disassembleBtn.addEventListener('click', () => {
  if (game.getMode() === 'won' || game.getMode() === 'assembled') {
    void game.disassemble();
  }
});

ui.clearBtn.addEventListener('click', () => game.clearSelection());

window.addEventListener('resize', () => game.resize());

void ensureUserLogin().then(() => {
  game.resize();
  game.start();
  syncUi('assembled', null);
});
