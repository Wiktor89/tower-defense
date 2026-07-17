import './style.css';
import '../../shared/tv-controls.css';
import type { PlantType } from '../../types';
import { finishTowerDefense, startTowerDefense } from '../../api/client';
import { ensureUserLogin } from '../../shared/login';
import { showChallengeReward } from '../../shared/solar-reward';
import { getUser } from '../../shared/user';
import { CONFIG } from './config';
import { Game } from './Game';

document.body.classList.add('tv-ready');

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const sunDisplay = document.getElementById('sun-display');
const waveDisplay = document.getElementById('wave-display');
const livesDisplay = document.getElementById('lives-display');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const overlayBtn = document.getElementById('overlay-btn');
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement | null;
const plantButtons = document.querySelectorAll<HTMLButtonElement>('.plant-btn');

if (!canvas || !sunDisplay || !waveDisplay || !livesDisplay || !overlay || !overlayTitle || !overlayText || !overlayBtn || !pauseBtn) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  canvas,
  sunDisplay,
  waveDisplay,
  livesDisplay,
  overlay,
  overlayTitle,
  overlayText,
  overlayBtn,
  pauseBtn,
};

const game = new Game(ui.canvas);
let lastReportedState: 'playing' | 'won' | 'lost' = 'playing';
let sessionId: string | null = null;

async function beginMatch(): Promise<void> {
  sessionId = null;
  const user = getUser();
  if (!user) return;
  try {
    const sess = await startTowerDefense(user.id);
    sessionId = sess.sessionId;
  } catch {
    sessionId = null;
  }
}

function reportResult(result: 'won' | 'lost'): void {
  if (!sessionId) return;
  const id = sessionId;
  sessionId = null;
  void finishTowerDefense(id, result)
    .then(res => {
      if (res.challengeReward) showChallengeReward(res.challengeReward);
    })
    .catch(() => {
      // best-effort; invalid/early sessions are rejected by server
    });
}

function updateUI(): void {
  ui.sunDisplay.textContent = `☀️ ${game.sun}`;
  ui.waveDisplay.textContent = `Волна: ${Math.min(game.wave, CONFIG.TOTAL_WAVES)}`;
  ui.livesDisplay.textContent = `❤️ ${game.lives}`;

  plantButtons.forEach(btn => {
    const type = btn.dataset.plant as PlantType;
    const cost = CONFIG.PLANTS[type].cost;
    const affordable = game.sun >= cost && !game.paused;
    btn.classList.toggle('disabled', !affordable);
    btn.classList.toggle('selected', game.selectedPlant === type);
  });

  const canPause = game.state === 'playing';
  ui.pauseBtn.disabled = !canPause;
  ui.pauseBtn.classList.toggle('paused', game.paused);
  ui.pauseBtn.textContent = game.paused ? '▶ Продолжить' : '⏸ Пауза';

  if (game.state === 'won') {
    ui.overlay.classList.remove('hidden');
    ui.overlayTitle.textContent = '🎉 Победа!';
    ui.overlayText.textContent = 'Вы отбили все волны зомби!';
    if (lastReportedState !== 'won') {
      lastReportedState = 'won';
      reportResult('won');
    }
  } else if (game.state === 'lost') {
    ui.overlay.classList.remove('hidden');
    ui.overlayTitle.textContent = '💀 Поражение';
    ui.overlayText.textContent = 'Зомби прорвались к дому...';
    if (lastReportedState !== 'lost') {
      lastReportedState = 'lost';
      reportResult('lost');
    }
  } else {
    ui.overlay.classList.add('hidden');
  }
}

game.onStateChange = updateUI;

plantButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (game.paused) return;
    const type = btn.dataset.plant as PlantType;
    if (game.sun >= CONFIG.PLANTS[type].cost) {
      game.selectPlant(type);
      updateUI();
    }
  });
});

ui.pauseBtn.addEventListener('click', () => {
  if (game.togglePause()) updateUI();
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'KeyP') return;
  if (game.state !== 'playing') return;
  e.preventDefault();
  if (game.togglePause()) updateUI();
});

ui.canvas.addEventListener('click', (e) => {
  const rect = ui.canvas.getBoundingClientRect();
  const scaleX = ui.canvas.width / rect.width;
  const scaleY = ui.canvas.height / rect.height;
  game.handleClick(
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY,
  );
  updateUI();
});

ui.canvas.addEventListener('mousemove', (e) => {
  const rect = ui.canvas.getBoundingClientRect();
  const scaleX = ui.canvas.width / rect.width;
  const scaleY = ui.canvas.height / rect.height;
  game.handleMouseMove(
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY,
  );
});

ui.overlayBtn.addEventListener('click', () => {
  void beginMatch().then(() => {
    game.reset();
    lastReportedState = 'playing';
    updateUI();
  });
});

void ensureUserLogin().then(() => beginMatch()).then(() => {
  game.start();
  updateUI();
});
