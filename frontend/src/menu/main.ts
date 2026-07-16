import './menu.css';
import '../shared/modal.css';
import { fetchGames } from '../api/client';
import type { GameCatalogItem } from '../types';
import { ensureUserLogin, promptUserLogin } from '../shared/login';
import { clearUser, getUser, isAdminUser } from '../shared/user';

const grid = document.getElementById('games-grid');
const userLabel = document.getElementById('user-label');
const switchUserBtn = document.getElementById('switch-user-btn');
const adminBtn = document.getElementById('admin-btn');
const logoutBtn = document.getElementById('logout-btn');

if (!grid || !userLabel || !switchUserBtn || !adminBtn || !logoutBtn) {
  throw new Error('Missing DOM elements');
}

const gamesGrid = grid;
const userLabelEl = userLabel;
const switchUserBtnEl = switchUserBtn;
const adminBtnEl = adminBtn;
const logoutBtnEl = logoutBtn;

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
    const gradeLabel = user.grade ? ` · ${user.grade} кл.` : '';
    userLabelEl.textContent = `👤 ${user.login}${gradeLabel}`;
    switchUserBtnEl.classList.remove('hidden');
    logoutBtnEl.classList.remove('hidden');
  } else {
    userLabelEl.textContent = '';
    switchUserBtnEl.classList.add('hidden');
    logoutBtnEl.classList.add('hidden');
  }

  if (isAdminUser(user)) {
    adminBtnEl.textContent = 'Администрирование';
    adminBtnEl.classList.remove('hidden');
  } else {
    adminBtnEl.classList.add('hidden');
  }
}

switchUserBtnEl.addEventListener('click', () => {
  clearUser();
  updateUserLabel();
  void promptUserLogin().then(() => updateUserLabel());
});

logoutBtnEl.addEventListener('click', () => {
  clearUser();
  updateUserLabel();
  void promptUserLogin().then(() => updateUserLabel());
});

adminBtnEl.addEventListener('click', () => {
  window.location.href = '/admin/';
});

async function init() {
  const user = await ensureUserLogin();
  updateUserLabel();

  try {
    const games = await fetchGames(user.id);
    if (games.length === 0) {
      gamesGrid.innerHTML = isAdminUser(user)
        ? '<p class="menu-error">Список игр пуст.</p>'
        : '<p class="menu-error">Администратор ещё не назначил ваш класс — игры появятся после этого.</p>';
      return;
    }
    games.forEach(game => gamesGrid.appendChild(createGameCard(game)));
  } catch {
    gamesGrid.innerHTML = '<p class="menu-error">Не удалось загрузить список игр. Запустите backend.</p>';
  }
}

void init();
