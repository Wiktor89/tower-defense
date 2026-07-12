import './menu.css';
import { fetchGames } from '../api/client';
import type { GameCatalogItem } from '../types';

const grid = document.getElementById('games-grid');
if (!grid) throw new Error('games-grid not found');

const gamesGrid = grid;

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

async function init() {
  try {
    const games = await fetchGames();
    games.forEach(game => gamesGrid.appendChild(createGameCard(game)));
  } catch {
    gamesGrid.innerHTML = '<p class="menu-error">Не удалось загрузить список игр. Запустите backend.</p>';
  }
}

void init();
