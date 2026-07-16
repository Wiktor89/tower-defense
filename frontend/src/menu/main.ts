import './menu.css';
import '../shared/modal.css';
import { fetchChallenge, fetchGames } from '../api/client';
import type { ChallengeStatus, GameCatalogItem } from '../types';
import { showAvatarPicker } from '../shared/avatar-picker';
import { getAvatar } from '../shared/avatars';
import { ensureUserLogin, promptUserLogin } from '../shared/login';
import { showChallengeReward } from '../shared/solar-reward';
import { clearUser, getUser, isAdminUser } from '../shared/user';

const grid = document.getElementById('games-grid');
const userLabel = document.getElementById('user-label');
const avatarBtn = document.getElementById('avatar-btn');
const adminBtn = document.getElementById('admin-btn');
const logoutBtn = document.getElementById('logout-btn');
const challengePanel = document.getElementById('challenge-panel');

if (!grid || !userLabel || !avatarBtn || !adminBtn || !logoutBtn || !challengePanel) {
  throw new Error('Missing DOM elements');
}

const gamesGrid = grid;
const userLabelEl = userLabel;
const avatarBtnEl = avatarBtn as HTMLButtonElement;
const adminBtnEl = adminBtn;
const logoutBtnEl = logoutBtn;
const challengePanelEl = challengePanel;

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

function renderWeekProgress(week: ChallengeStatus['week']): string {
  if (!week?.days?.length) return '';
  const nodes = week.days.map((d, i) => `
    <div class="challenge-week__day${d.done ? ' challenge-week__day--done' : ''}${i === week.days.length - 1 ? ' challenge-week__day--today' : ''}">
      <span class="challenge-week__dot" aria-hidden="true">${d.done ? '★' : ''}</span>
      <span class="challenge-week__label">${d.label}</span>
    </div>
  `).join('<span class="challenge-week__line" aria-hidden="true"></span>');

  return `
    <div class="challenge-week">
      <div class="challenge-week__head">
        <span class="challenge-week__title">За 7 дней</span>
        <span class="challenge-week__wins">${week.wins} из 7</span>
      </div>
      <div class="challenge-week__track" role="img" aria-label="Победы за неделю: ${week.wins} из 7">
        ${nodes}
      </div>
      <p class="challenge-week__praise">${week.praise}</p>
    </div>
  `;
}

function renderChallenge(status: ChallengeStatus): void {
  if (!status.total) {
    challengePanelEl.classList.add('hidden');
    challengePanelEl.innerHTML = '';
    return;
  }

  const items = status.games.map((g, i) => {
    const title = g.title ?? g.gameId;
    const inner = `
      <span class="challenge-item__n">${i + 1}</span>
      <span class="challenge-item__title">${title}</span>
      <span class="challenge-item__mark">${g.done ? '✓' : '○'}</span>
    `;
    if (g.url && !g.done) {
      return `<li><a class="challenge-item" href="${g.url}">${inner}</a></li>`;
    }
    return `<li class="challenge-item${g.done ? ' challenge-item--done' : ''}">${inner}</li>`;
  }).join('');

  const rewardBtn = status.allDone && status.reward
    ? `<button type="button" class="challenge-reward-btn" id="challenge-reward-btn">Показать код награды</button>`
    : '';

  challengePanelEl.innerHTML = `
    <div class="challenge-card">
      <h2 class="challenge-title">🎯 Вызов дня</h2>
      <p class="challenge-progress">Пройдено ${status.completed} из ${status.total}</p>
      ${renderWeekProgress(status.week)}
      <ol class="challenge-list">${items}</ol>
      ${status.allDone
        ? `<p class="challenge-done">Все задания выполнены!${rewardBtn ? '' : ''}</p>${rewardBtn}`
        : '<p class="challenge-hint">Пройдите все игры из списка, чтобы получить код с планетой.</p>'}
    </div>
  `;
  challengePanelEl.classList.remove('hidden');

  challengePanelEl.querySelector('#challenge-reward-btn')?.addEventListener('click', () => {
    if (status.reward) showChallengeReward(status.reward);
  });

  if (status.allDone && status.reward && !sessionStorage.getItem(`challenge_reward_shown_${status.reward.id}`)) {
    sessionStorage.setItem(`challenge_reward_shown_${status.reward.id}`, '1');
    showChallengeReward(status.reward);
  }
}

function updateUserLabel(): void {
  const user = getUser();
  if (user) {
    const gradeLabel = user.grade ? ` · ${user.grade} кл.` : '';
    const avatar = getAvatar(user.avatar);
    avatarBtnEl.textContent = avatar.emoji;
    avatarBtnEl.title = `Аватар: ${avatar.name}`;
    avatarBtnEl.classList.remove('hidden');
    userLabelEl.textContent = `${user.login}${gradeLabel}`;
    logoutBtnEl.classList.remove('hidden');
  } else {
    avatarBtnEl.classList.add('hidden');
    avatarBtnEl.textContent = '';
    userLabelEl.textContent = '';
    logoutBtnEl.classList.add('hidden');
  }

  if (isAdminUser(user)) {
    adminBtnEl.textContent = 'Администрирование';
    adminBtnEl.classList.remove('hidden');
  } else {
    adminBtnEl.classList.add('hidden');
  }
}

async function loadMenuForUser(userId: number, isAdmin: boolean): Promise<void> {
  gamesGrid.innerHTML = '';
  challengePanelEl.classList.add('hidden');
  challengePanelEl.innerHTML = '';

  try {
    const [games, challenge] = await Promise.all([
      fetchGames(userId),
      fetchChallenge(userId).catch(() => null),
    ]);

    if (challenge) renderChallenge(challenge);
    else {
      challengePanelEl.classList.add('hidden');
      challengePanelEl.innerHTML = '';
    }

    if (games.length === 0) {
      gamesGrid.innerHTML = isAdmin
        ? '<p class="menu-error">Список игр пуст.</p>'
        : '<p class="menu-error">Администратор ещё не назначил ваш класс — игры появятся после этого.</p>';
      return;
    }
    games.forEach(game => gamesGrid.appendChild(createGameCard(game)));
  } catch {
    gamesGrid.innerHTML = '<p class="menu-error">Не удалось загрузить список игр. Запустите backend.</p>';
  }
}

async function afterLogin(): Promise<void> {
  const user = getUser();
  updateUserLabel();
  if (!user) return;
  if (!user.avatar) {
    showAvatarPicker(() => updateUserLabel());
  }
  await loadMenuForUser(user.id, isAdminUser(user));
}

avatarBtnEl.addEventListener('click', () => {
  showAvatarPicker(() => updateUserLabel());
});

logoutBtnEl.addEventListener('click', () => {
  clearUser();
  updateUserLabel();
  gamesGrid.innerHTML = '';
  challengePanelEl.classList.add('hidden');
  challengePanelEl.innerHTML = '';
  void promptUserLogin().then(() => afterLogin());
});

adminBtnEl.addEventListener('click', () => {
  window.location.href = '/admin/';
});

async function init() {
  await ensureUserLogin();
  await afterLogin();
}

void init();
