import './admin.css';
import '../shared/modal.css';
import { adminLogin, adminVerify, fetchAdminStages, fetchAdminStats } from '../api/client';
import type { StageCompletion, UserStatsRow } from '../types';
import { PLANETS } from '../games/math-columns/planets';
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

function renderDashboard(token: string, rows: UserStatsRow[], stages: StageCompletion[]): void {
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

  const stageRows = stages.map(s => `
    <tr class="${s.verified ? 'admin-row--verified' : ''}">
      <td>${s.userLogin ?? '—'}</td>
      <td>${GAME_NAMES[s.gameId] ?? s.gameId}</td>
      <td>${s.stage} класс</td>
      <td>${s.planetName}</td>
      <td>${s.code}</td>
      <td>${s.rewardRub}₽</td>
      <td>${s.verified ? '✅ Да' : '⏳ Нет'}</td>
      <td>${new Date(s.completedAt).toLocaleString('ru-RU')}</td>
    </tr>
  `).join('');

  const planetOptions = PLANETS.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join('');

  appEl.innerHTML = `
    <header class="admin-header">
      <h1>📊 Администратор</h1>
      <div class="admin-header__actions">
        <button id="refresh-btn" class="admin-btn admin-btn--ghost">Обновить</button>
        <button id="logout-btn" class="admin-btn admin-btn--ghost">Выйти</button>
        <a href="/" class="admin-btn admin-btn--ghost">← Меню</a>
      </div>
    </header>

    <section class="admin-section">
      <h2>🔍 Проверка прохождения этапа</h2>
      <p class="admin-section__hint">Спросите у ребёнка планету и двузначную цифру с экрана награды</p>
      <form id="verify-form" class="admin-verify-form">
        <input type="text" id="verify-login" placeholder="Логин пользователя" required>
        <select id="verify-game">
          <option value="math-columns">📐 Столбик</option>
        </select>
        <select id="verify-stage">
          <option value="1">1 класс</option>
          <option value="2">2 класс</option>
          <option value="3">3 класс</option>
        </select>
        <select id="verify-planet" required>
          <option value="">Планета</option>
          ${planetOptions}
        </select>
        <input type="number" id="verify-code" placeholder="Код (10–99)" min="10" max="99" required>
        <button type="submit" class="admin-btn">Проверить</button>
      </form>
      <p class="admin-verify-result hidden" id="verify-result"></p>
    </section>

    <section class="admin-section">
      <h2>🪐 Пройденные этапы</h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Логин</th>
              <th>Игра</th>
              <th>Этап</th>
              <th>Планета</th>
              <th>Код</th>
              <th>Награда</th>
              <th>Подтверждён</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            ${stageRows || '<tr><td colspan="8" class="admin-empty">Пока нет прохождений</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>📈 Статистика игроков</h2>
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
    </section>
  `;

  appEl.querySelector('#logout-btn')?.addEventListener('click', () => {
    clearAdminToken();
    renderLogin();
  });

  appEl.querySelector('#refresh-btn')?.addEventListener('click', () => {
    void loadDashboard(token);
  });

  appEl.querySelector<HTMLFormElement>('#verify-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = appEl.querySelector<HTMLParagraphElement>('#verify-result')!;
    const userLogin = (appEl.querySelector('#verify-login') as HTMLInputElement).value.trim();
    const gameId = (appEl.querySelector('#verify-game') as HTMLSelectElement).value;
    const stage = Number((appEl.querySelector('#verify-stage') as HTMLSelectElement).value);
    const planet = (appEl.querySelector('#verify-planet') as HTMLSelectElement).value;
    const code = Number((appEl.querySelector('#verify-code') as HTMLInputElement).value);

    try {
      const result = await adminVerify(token, { userLogin, gameId, stage, planet, code });
      resultEl.textContent = result.message;
      resultEl.className = `admin-verify-result ${result.verified ? 'admin-verify-result--ok' : 'admin-verify-result--fail'}`;
      if (result.verified) {
        void loadDashboard(token);
      }
    } catch (err) {
      resultEl.textContent = err instanceof Error ? err.message : 'Ошибка проверки';
      resultEl.className = 'admin-verify-result admin-verify-result--fail';
    }
  });
}

async function loadDashboard(token: string): Promise<void> {
  try {
    const [rows, stages] = await Promise.all([
      fetchAdminStats(token),
      fetchAdminStages(token),
    ]);
    renderDashboard(token, rows, stages);
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
