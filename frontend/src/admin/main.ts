import './admin.css';
import '../shared/modal.css';
import { adminDeleteUser, adminLogin, adminVerify, fetchAdminMathColumnsSettings, fetchAdminStages, fetchAdminStats, updateMathColumnsSettings } from '../api/client';
import type { GameSettings, StageCompletion, UserStatsRow } from '../types';
import { PLANETS } from '../games/math-columns/planets';
import { getAdminToken, setAdminToken, clearAdminToken } from '../shared/user';

const app = document.getElementById('admin-app');
if (!app) throw new Error('admin-app not found');

const GAME_NAMES: Record<string, string> = {
  'tower-defense': '🌻 Защита от зомби',
  'math-columns': '📐 Столбик',
};

type AdminTab = 'settings' | 'verify' | 'stats';

const TAB_KEY = 'admin_active_tab';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'settings', label: 'Настройки игр' },
  { id: 'verify', label: 'Проверка прохождения этапа' },
  { id: 'stats', label: 'Статистика игроков' },
];

const appEl = app;

function getActiveTab(): AdminTab {
  const saved = sessionStorage.getItem(TAB_KEY);
  if (saved === 'settings' || saved === 'verify' || saved === 'stats') return saved;
  return 'settings';
}

function setActiveTab(tab: AdminTab): void {
  sessionStorage.setItem(TAB_KEY, tab);
}

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

function renderDeleteButton(userId: number, login: string, rowspan: number): string {
  return `
    <td rowspan="${rowspan}" class="admin-actions-cell">
      <button type="button" class="admin-btn admin-btn--danger admin-delete-btn"
        data-user-id="${userId}" data-user-login="${login}">Удалить</button>
    </td>
  `;
}

function renderStatsTable(rows: UserStatsRow[]): string {
  const tableRows = rows.map(user => {
    const rowSpan = Math.max(user.games.length, 1);
    if (user.games.length === 0) {
      return `
        <tr>
          <td>${user.login}</td>
          <td colspan="6" class="admin-empty">Ещё не играл</td>
          ${renderDeleteButton(user.userId, user.login, 1)}
        </tr>
      `;
    }
    return user.games.map((g, i) => `
      <tr>
        ${i === 0 ? `<td rowspan="${rowSpan}">${user.login}</td>` : ''}
        <td>${GAME_NAMES[g.gameId] ?? g.gameId}</td>
        <td>${g.correct}</td>
        <td>${g.wrong}</td>
        <td>${g.sessionsCompleted}</td>
        <td>${g.gamesWon}</td>
        <td>${g.gamesLost}</td>
        ${i === 0 ? renderDeleteButton(user.userId, user.login, rowSpan) : ''}
      </tr>
    `).join('');
  }).join('');

  return `
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="8" class="admin-empty">Нет данных</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function showDeleteConfirm(login: string, onConfirm: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Удалить пользователя?</h2>
      <p>Будут удалены все данные игрока <strong>${login}</strong>: статистика, этапы и настройки.</p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn--ghost" id="delete-cancel">Отмена</button>
        <button type="button" class="modal-btn admin-btn--danger" id="delete-confirm">Удалить</button>
      </div>
      <p class="modal-error hidden" id="delete-error"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#delete-cancel')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('#delete-confirm')?.addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}

function renderStagesTable(stages: StageCompletion[]): string {
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

  return `
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
  `;
}

function renderSettingsTab(mathSettings: GameSettings | null): string {
  return `
    <section class="admin-section">
      <h2>📐 Столбик</h2>
      <p class="admin-section__hint">Сколько правильных примеров нужно решить для завершения серии</p>
      <form id="settings-form" class="admin-verify-form">
        <label class="admin-field">
          <span>Примеров в серии</span>
          <input type="number" id="session-size" min="1" max="200"
            value="${mathSettings?.sessionSize ?? 50}" required>
        </label>
        <button type="submit" class="admin-btn">Сохранить</button>
      </form>
      <p class="admin-verify-result hidden" id="settings-result"></p>
    </section>
  `;
}

function renderVerifyTab(stages: StageCompletion[]): string {
  const planetOptions = PLANETS.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join('');

  return `
    <section class="admin-section">
      <h2>🔍 Проверка кода</h2>
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
      ${renderStagesTable(stages)}
    </section>
  `;
}

function renderDashboard(
  token: string,
  rows: UserStatsRow[],
  stages: StageCompletion[],
  mathSettings: GameSettings | null,
  loadError?: string,
  loading = false,
): void {
  const activeTab = getActiveTab();

  const tabButtons = TABS.map(tab => `
    <button type="button" class="admin-tab${tab.id === activeTab ? ' admin-tab--active' : ''}"
      data-tab="${tab.id}">${tab.label}</button>
  `).join('');

  appEl.innerHTML = `
    <header class="admin-header">
      <h1>📊 Администратор</h1>
      <div class="admin-header__actions">
        <button id="refresh-btn" class="admin-btn admin-btn--ghost">Обновить</button>
        <button id="logout-btn" class="admin-btn admin-btn--ghost">Выйти</button>
        <a href="/" class="admin-btn admin-btn--ghost">← Меню</a>
      </div>
    </header>
    ${loadError ? `<p class="admin-load-error">${loadError}</p>` : ''}
    ${loading ? '<p class="admin-loading-inline">Загрузка данных…</p>' : ''}

    <nav class="admin-tabs">${tabButtons}</nav>

    <div class="admin-tab-panel${activeTab === 'settings' ? ' admin-tab-panel--active' : ''}" data-panel="settings">
      ${renderSettingsTab(mathSettings)}
    </div>

    <div class="admin-tab-panel${activeTab === 'verify' ? ' admin-tab-panel--active' : ''}" data-panel="verify">
      ${renderVerifyTab(stages)}
    </div>

    <div class="admin-tab-panel${activeTab === 'stats' ? ' admin-tab-panel--active' : ''}" data-panel="stats">
      <section class="admin-section">
        <h2>📈 Статистика игроков</h2>
        ${renderStatsTable(rows)}
      </section>
    </div>
  `;

  appEl.querySelectorAll<HTMLButtonElement>('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as AdminTab;
      setActiveTab(tab);
      appEl.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('admin-tab--active'));
      btn.classList.add('admin-tab--active');
      appEl.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.classList.toggle('admin-tab-panel--active', panel.getAttribute('data-panel') === tab);
      });
    });
  });

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
        setActiveTab('verify');
        void loadDashboard(token);
      }
    } catch (err) {
      resultEl.textContent = err instanceof Error ? err.message : 'Ошибка проверки';
      resultEl.className = 'admin-verify-result admin-verify-result--fail';
    }
  });

  appEl.querySelector<HTMLFormElement>('#settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = appEl.querySelector<HTMLParagraphElement>('#settings-result')!;
    const sessionSize = Number((appEl.querySelector('#session-size') as HTMLInputElement).value);

    try {
      const settings = await updateMathColumnsSettings(token, sessionSize);
      resultEl.textContent = `Сохранено: ${settings.sessionSize} примеров в серии`;
      resultEl.className = 'admin-verify-result admin-verify-result--ok';
    } catch (err) {
      resultEl.textContent = err instanceof Error ? err.message : 'Ошибка сохранения';
      resultEl.className = 'admin-verify-result admin-verify-result--fail';
    }
  });

  appEl.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = Number(btn.dataset.userId);
      const login = btn.dataset.userLogin ?? '';
      showDeleteConfirm(login, () => {
        void adminDeleteUser(token, userId)
          .then(() => {
            setActiveTab('stats');
            void loadDashboard(token);
          })
          .catch(err => {
            alert(err instanceof Error ? err.message : 'Не удалось удалить пользователя');
          });
      });
    });
  });
}

async function loadDashboard(token: string): Promise<void> {
  const activeTab = getActiveTab();
  renderDashboard(token, [], [], null, undefined, true);
  setActiveTab(activeTab);

  const [statsResult, stagesResult, settingsResult] = await Promise.allSettled([
    fetchAdminStats(token),
    fetchAdminStages(token),
    fetchAdminMathColumnsSettings(token),
  ]);

  const unauthorized = [statsResult, stagesResult, settingsResult].some(
    r => r.status === 'rejected' && r.reason instanceof Error && r.reason.message.toLowerCase().includes('unauthorized'),
  );
  if (unauthorized) {
    clearAdminToken();
    renderLogin();
    return;
  }

  const rows = statsResult.status === 'fulfilled' ? statsResult.value : [];
  const stages = stagesResult.status === 'fulfilled' ? stagesResult.value : [];
  const mathSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : null;

  const errors: string[] = [];
  if (statsResult.status === 'rejected') {
    const msg = statsResult.reason instanceof Error ? statsResult.reason.message : 'не удалось загрузить статистику';
    errors.push(msg);
  }
  if (stagesResult.status === 'rejected') {
    const msg = stagesResult.reason instanceof Error ? stagesResult.reason.message : 'не удалось загрузить этапы';
    errors.push(msg);
  }
  if (settingsResult.status === 'rejected') {
    const msg = settingsResult.reason instanceof Error ? settingsResult.reason.message : 'не удалось загрузить настройки';
    errors.push(msg);
  }

  renderDashboard(token, rows, stages, mathSettings, errors.length ? `⚠️ ${errors.join('; ')}` : undefined);
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
