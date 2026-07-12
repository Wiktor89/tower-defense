import './admin.css';
import '../shared/modal.css';
import { adminLogin, fetchAdminStats } from '../api/client';
import type { UserStatsRow } from '../types';
import { getAdminToken, setAdminToken, clearAdminToken } from '../shared/user';

const app = document.getElementById('admin-app');
if (!app) throw new Error('admin-app not found');

const GAME_NAMES: Record<string, string> = {
  'tower-defense': '🌻 Защита от зомби',
  'math-columns': '📐 Столбик',
};

const appEl = app;

function renderLogin(): void {
  appEl.innerHTML = `
    <div class="admin-login">
      <h1>Администратор</h1>
      <form id="login-form" class="admin-form">
        <input type="text" id="login" placeholder="Логин" required autofocus>
        <input type="password" id="password" placeholder="Пароль" required>
        <button type="submit" class="admin-btn">Войти</button>
      </form>
      <p class="admin-error hidden" id="login-error"></p>
      <a href="/" class="admin-back">← На главную</a>
    </div>
  `;

  const form = appEl.querySelector<HTMLFormElement>('#login-form')!;
  const errorEl = appEl.querySelector<HTMLParagraphElement>('#login-error')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = (appEl.querySelector('#login') as HTMLInputElement).value;
    const password = (appEl.querySelector('#password') as HTMLInputElement).value;
    try {
      const token = await adminLogin(login, password);
      setAdminToken(token);
      void loadDashboard(token);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Ошибка входа';
      errorEl.classList.remove('hidden');
    }
  });
}

function renderDashboard(token: string, rows: UserStatsRow[]): void {
  const tableRows = rows.map(user => {
    if (user.games.length === 0) {
      return `
        <tr>
          <td>${user.login}</td>
          <td colspan="6" class="admin-empty">Ещё не играл</td>
        </tr>
      `;
    }
    return user.games.map((g, i) => `
      <tr>
        ${i === 0 ? `<td rowspan="${user.games.length}">${user.login}</td>` : ''}
        <td>${GAME_NAMES[g.gameId] ?? g.gameId}</td>
        <td>${g.correct}</td>
        <td>${g.wrong}</td>
        <td>${g.sessionsCompleted}</td>
        <td>${g.gamesWon}</td>
        <td>${g.gamesLost}</td>
      </tr>
    `).join('');
  }).join('');

  appEl.innerHTML = `
    <header class="admin-header">
      <h1>📊 Статистика игроков</h1>
      <div class="admin-header__actions">
        <button id="refresh-btn" class="admin-btn admin-btn--ghost">Обновить</button>
        <button id="logout-btn" class="admin-btn admin-btn--ghost">Выйти</button>
        <a href="/" class="admin-btn admin-btn--ghost">← Меню</a>
      </div>
    </header>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Логин</th>
            <th>Игра</th>
            <th>✓</th>
            <th>✗</th>
            <th>Серии</th>
            <th>Победы</th>
            <th>Поражения</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="7" class="admin-empty">Нет данных</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  appEl.querySelector('#logout-btn')?.addEventListener('click', () => {
    clearAdminToken();
    renderLogin();
  });

  appEl.querySelector('#refresh-btn')?.addEventListener('click', () => {
    void loadDashboard(token);
  });
}

async function loadDashboard(token: string): Promise<void> {
  try {
    const rows = await fetchAdminStats(token);
    renderDashboard(token, rows);
  } catch {
    clearAdminToken();
    renderLogin();
  }
}

async function init(): Promise<void> {
  const token = getAdminToken();
  if (token) {
    await loadDashboard(token);
  } else {
    renderLogin();
  }
}

void init();
