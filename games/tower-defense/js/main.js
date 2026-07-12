import { CONFIG } from './config.js';
import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const sunDisplay = document.getElementById('sun-display');
const waveDisplay = document.getElementById('wave-display');
const livesDisplay = document.getElementById('lives-display');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const overlayBtn = document.getElementById('overlay-btn');
const pauseBtn = document.getElementById('pause-btn');
const plantButtons = document.querySelectorAll('.plant-btn');

const game = new Game(canvas);

function updateUI() {
  sunDisplay.textContent = `☀️ ${game.sun}`;
  waveDisplay.textContent = `Волна: ${Math.min(game.wave, CONFIG.TOTAL_WAVES)}`;
  livesDisplay.textContent = `❤️ ${game.lives}`;

  plantButtons.forEach(btn => {
    const type = btn.dataset.plant;
    const cost = CONFIG.PLANTS[type].cost;
    const affordable = game.sun >= cost && !game.paused;
    btn.classList.toggle('disabled', !affordable);
    btn.classList.toggle('selected', game.selectedPlant === type);
  });

  const canPause = game.state === 'playing';
  pauseBtn.disabled = !canPause;
  pauseBtn.classList.toggle('paused', game.paused);
  pauseBtn.textContent = game.paused ? '▶ Продолжить' : '⏸ Пауза';

  if (game.state === 'won') {
    overlay.classList.remove('hidden');
    overlayTitle.textContent = '🎉 Победа!';
    overlayText.textContent = 'Вы отбили все волны зомби!';
  } else if (game.state === 'lost') {
    overlay.classList.remove('hidden');
    overlayTitle.textContent = '💀 Поражение';
    overlayText.textContent = 'Зомби прорвались к дому...';
  } else {
    overlay.classList.add('hidden');
  }
}

game.onStateChange = updateUI;

plantButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (game.paused) return;
    const type = btn.dataset.plant;
    if (game.sun >= CONFIG.PLANTS[type].cost) {
      game.selectPlant(type);
      updateUI();
    }
  });
});

pauseBtn.addEventListener('click', () => {
  if (game.togglePause()) updateUI();
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'KeyP') return;
  if (game.state !== 'playing') return;
  e.preventDefault();
  if (game.togglePause()) updateUI();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  game.handleClick(
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY
  );
  updateUI();
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  game.handleMouseMove(
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY
  );
});

overlayBtn.addEventListener('click', () => {
  game.reset();
  updateUI();
});

game.start();
updateUI();
