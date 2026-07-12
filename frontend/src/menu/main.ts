import './menu.css';
import '../shared/modal.css';
import { fetchGames } from '../api/client';
import type { GameCatalogItem } from '../types';
import { ensureUserLogin, promptUserLogin, showSetPasswordModal } from '../shared/login';
import { clearUser, getUser } from '../shared/user';

const grid = document.getElementById('games-grid');
const userLabel = document.getElementById('user-label');
const switchUserBtn = document.getElementById('switch-user-btn');
const passwordBtn = document.getElementById('password-btn');
const adminBtn = document.getElementById('admin-btn');

if (!grid || !userLabel || !switchUserBtn || !passwordBtn || !adminBtn) {
  throw new Error('Missing DOM elements');
}

const gamesGrid = grid;
const userLabelEl = userLabel;
const switchUserBtnEl = switchUserBtn;
const passwordBtnEl = passwordBtn;

function createGameCard(game: GameCatalogItem): HTMLElement {
  const card = document.createElement('article');
  card.className = `game-card${game.available ? '' : ' game-card--soon'}`;
  card.dataset.gameId = game.id;

  const tags = game.tags
    .map(tag => `<span class="game-card__tag">${tag}</span>`)
    .join('');

  if (game.available) {
    card.innerHTML = `
      <div class="game-card__icon">${game.icon}</div>
      <h2 class="game-card__title">${game.title}</h2>
      <p class="game-card__desc">${game.description}</p>
      <div class="game-card__tags">${tags}</div>
      <a class="game-card__btn" href="${game.url}">Играть</a>
    `;
  } else {
    card.innerHTML = `
      <div class="game-card__icon">${game.icon}</div>
      <span class="game-card__badge">Скоро</span>
      <h2 class="game-card__title">${game.title}</h2>
      <p class="game-card__desc">${game.description}</p>
      <div class="game-card__tags">${tags}</div>
      <span class="game-card__btn game-card__btn--disabled">Недоступно</span>
    `;
  }

  return card;
}

function updateUserLabel(): void {
  const user = getUser();
  if (user) {
    const lock = user.hasPassword ? ' 🔒' : '';
    userLabelEl.textContent = `👤 ${user.login}${lock}`;
    switchUserBtnEl.classList.remove('hidden');
    passwordBtnEl.classList.remove('hidden');
    passwordBtnEl.textContent = user.hasPassword ? 'Сменить пароль' : 'Задать пароль';
  } else {
    userLabelEl.textContent = '';
    switchUserBtnEl.classList.add('hidden');
    passwordBtnEl.classList.add('hidden');
  }
}

switchUserBtnEl.addEventListener('click', () => {
  clearUser();
  updateUserLabel();
  void promptUserLogin().then(() => updateUserLabel());
});

passwordBtnEl.addEventListener('click', () => {
  const user = getUser();
  if (!user) return;
  showSetPasswordModal(user, () => updateUserLabel());
});

adminBtn.addEventListener('click', () => {
  window.location.href = '/admin/';
});

async function init() {
  await ensureUserLogin();
  updateUserLabel();

  try {
    const games = await fetchGames();
    games.forEach(game => gamesGrid.appendChild(createGameCard(game)));
  } catch {
    gamesGrid.innerHTML = '<p class="menu-error">Не удалось загрузить список игр. Запустите backend.</p>';
  }
}

void init();
