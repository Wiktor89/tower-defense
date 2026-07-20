import './style.css';
import '../../shared/tv-controls.css';
import '../../shared/series-progress.css';
import { clearMemoryBoard, fetchMemorySession } from '../../api/client';
import { showChallengeReward } from '../../shared/solar-reward';
import { updateSeriesProgress } from '../../shared/series-progress';
import { ensureUserLogin } from '../../shared/login';
import { MemoryGame } from './game';

document.body.classList.add('tv-ready');

const DEFAULT_SESSION_SIZE = 5;

const grid = document.getElementById('card-grid');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
const scoreBoards = document.getElementById('score-boards');
const scorePairs = document.getElementById('score-pairs');
const feedbackEl = document.getElementById('feedback');
const progressSection = document.getElementById('progress-section');
const progressFillEl = document.getElementById('progress-fill');
const progressMarkerEl = document.getElementById('progress-marker');
const progressTextEl = document.getElementById('progress-text');

if (
  !grid || !overlay || !overlayText || !startBtn || !scoreBoards || !scorePairs ||
  !feedbackEl || !progressSection || !progressFillEl || !progressMarkerEl || !progressTextEl
) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  grid,
  overlay,
  overlayText,
  startBtn,
  scoreBoards,
  scorePairs,
  feedbackEl,
};

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
let saving = false;

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
  ui.scoreBoards.textContent = `🏆 ${sessionSolved}`;
  ui.scorePairs.textContent = `пары ${game.pairsFound}/${game.pairsTotal}`;
}

function showOverlay(text: string, btnLabel: string): void {
  ui.overlayText.textContent = text;
  ui.startBtn.textContent = btnLabel;
  ui.overlay.classList.remove('hidden');
}

function hideOverlay(): void {
  ui.overlay.classList.add('hidden');
}

const game = new MemoryGame(ui.grid, {
  onPair: () => updateHud(),
  onComplete: () => {
    void onBoardCleared();
  },
});
game.bindClicks();

async function onBoardCleared(): Promise<void> {
  showFeedback('Все пары найдены!', 'correct');
  if (!userId || sessionComplete || saving) {
    showOverlay('Отлично! Сыграйте ещё раз.', 'Ещё раз');
    return;
  }
  saving = true;
  try {
    const result = await clearMemoryBoard(userId);
    if (typeof result.sessionSolved === 'number') sessionSolved = result.sessionSolved;
    else sessionSolved += 1;
    if (typeof result.sessionSize === 'number' && result.sessionSize > 0) {
      sessionSize = result.sessionSize;
    }
    if (result.sessionComplete) {
      sessionComplete = true;
      sessionSolved = sessionSize;
      showFeedback(`Серия из ${sessionSize} раундов завершена!`, 'correct');
      if (result.challengeReward) showChallengeReward(result.challengeReward);
    }
    refreshSeriesProgress();
    updateHud();
    showOverlay(
      sessionComplete
        ? `Серия из ${sessionSize} раундов собрана!`
        : `Раунд ${sessionSolved} из ${sessionSize}`,
      'Ещё раз',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.toLowerCase().includes('too fast')) {
      showFeedback(msg || 'Не удалось сохранить раунд', 'hint');
    }
    showOverlay('Раунд пройден. Можно сыграть ещё.', 'Ещё раз');
  } finally {
    saving = false;
  }
}

function startRound(): void {
  hideFeedback();
  hideOverlay();
  game.reset();
  updateHud();
}

ui.startBtn.addEventListener('click', () => startRound());

game.reset();
updateHud();
refreshSeriesProgress();

void ensureUserLogin().then(async (user) => {
  userId = user.id;
  try {
    const session = await fetchMemorySession(userId);
    sessionSolved = session.solved;
    if (typeof session.sessionSize === 'number' && session.sessionSize > 0) {
      sessionSize = session.sessionSize;
    }
    sessionComplete = !!session.complete;
    if (sessionComplete) sessionSolved = sessionSize;
    updateHud();
    refreshSeriesProgress();
    if (sessionComplete) {
      showOverlay(`Серия из ${sessionSize} раундов уже собрана сегодня.`, 'Играть ещё');
    }
  } catch {
    /* keep defaults */
  }
});
