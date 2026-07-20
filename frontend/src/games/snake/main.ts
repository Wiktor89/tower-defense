import './style.css';
import '../../shared/tv-controls.css';
import '../../shared/series-progress.css';
import { eatSnakeApple, fetchSnakeSession } from '../../api/client';
import { showChallengeReward } from '../../shared/solar-reward';
import { updateSeriesProgress } from '../../shared/series-progress';
import { ensureUserLogin } from '../../shared/login';
import { SnakeGame, type Dir } from './game';

document.body.classList.add('tv-ready');

const DEFAULT_SESSION_SIZE = 10;

const canvas = document.getElementById('snake-canvas') as HTMLCanvasElement | null;
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
const scoreApples = document.getElementById('score-apples');
const scoreLength = document.getElementById('score-length');
const feedbackEl = document.getElementById('feedback');
const progressSection = document.getElementById('progress-section');
const progressFillEl = document.getElementById('progress-fill');
const progressMarkerEl = document.getElementById('progress-marker');
const progressTextEl = document.getElementById('progress-text');

if (
  !canvas || !overlay || !overlayText || !startBtn || !scoreApples || !scoreLength ||
  !feedbackEl || !progressSection || !progressFillEl || !progressMarkerEl || !progressTextEl
) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  canvas,
  overlay,
  overlayText,
  startBtn,
  scoreApples,
  scoreLength,
  feedbackEl,
};

const ctx = ui.canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D not available');

const progressElements = {
  fillEl: progressFillEl,
  markerEl: progressMarkerEl,
  textEl: progressTextEl,
  sectionEl: progressSection,
};

let userId = 0;
let sessionSolved = 0;
let sessionSize = DEFAULT_SESSION_SIZE;
let sessionComplete = false;

function refreshSeriesProgress(): void {
  updateSeriesProgress(sessionSolved, sessionSize, progressElements);
}

function showFeedback(text: string, type: 'correct' | 'hint'): void {
  ui.feedbackEl.textContent = text;
  ui.feedbackEl.className = `feedback ${type}`;
}

function hideFeedback(): void {
  ui.feedbackEl.className = 'feedback hidden';
}

function updateHud(): void {
  ui.scoreApples.textContent = `🍎 ${sessionSolved}`;
  ui.scoreLength.textContent = `длина ${game.length}`;
}

function showOverlay(text: string, btnLabel: string): void {
  ui.overlayText.textContent = text;
  ui.startBtn.textContent = btnLabel;
  ui.overlay.classList.remove('hidden');
}

function hideOverlay(): void {
  ui.overlay.classList.add('hidden');
}

const game = new SnakeGame(ui.canvas, ctx, {
  cols: 20,
  rows: 20,
  cell: 20,
  tickMs: 120,
  onEat: async () => {
    updateHud();
    if (!userId || sessionComplete) return;
    try {
      const result = await eatSnakeApple(userId);
      if (typeof result.sessionSolved === 'number') sessionSolved = result.sessionSolved;
      else sessionSolved += 1;
      if (typeof result.sessionSize === 'number' && result.sessionSize > 0) {
        sessionSize = result.sessionSize;
      }
      if (result.sessionComplete) {
        sessionComplete = true;
        sessionSolved = sessionSize;
        showFeedback(`Серия из ${sessionSize} яблок завершена!`, 'correct');
        if (result.challengeReward) showChallengeReward(result.challengeReward);
      }
      refreshSeriesProgress();
      updateHud();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.toLowerCase().includes('too fast')) {
        showFeedback(msg || 'Не удалось сохранить яблоко', 'hint');
      }
    }
  },
  onDie: () => {
    updateHud();
    showOverlay('Столкновение! Попробуйте ещё раз.', 'Ещё раз');
  },
});

function startRound(): void {
  hideFeedback();
  hideOverlay();
  game.reset();
  updateHud();
  game.start();
}

ui.startBtn.addEventListener('click', () => startRound());

const keyMap: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
};

window.addEventListener('keydown', (e) => {
  const dir = keyMap[e.key];
  if (!dir) return;
  e.preventDefault();
  game.setDirection(dir);
});

let touchStart: { x: number; y: number } | null = null;
ui.canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  if (!t) return;
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

ui.canvas.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    game.setDirection(dx > 0 ? 'right' : 'left');
  } else {
    game.setDirection(dy > 0 ? 'down' : 'up');
  }
}, { passive: true });

game.reset();
updateHud();
refreshSeriesProgress();

void ensureUserLogin().then(async (user) => {
  userId = user.id;
  try {
    const session = await fetchSnakeSession(userId);
    sessionSolved = session.solved;
    if (typeof session.sessionSize === 'number' && session.sessionSize > 0) {
      sessionSize = session.sessionSize;
    }
    sessionComplete = !!session.complete;
    if (sessionComplete) sessionSolved = sessionSize;
    updateHud();
    refreshSeriesProgress();
    if (sessionComplete) {
      showOverlay(`Серия из ${sessionSize} яблок уже собрана сегодня.`, 'Играть ещё');
    }
  } catch {
    /* keep defaults */
  }
});
