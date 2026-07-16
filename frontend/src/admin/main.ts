import './admin.css';
import '../shared/modal.css';
import { adminDeleteUser, adminLogin, adminSetUserGrade, adminVerify, addAdminFillBlankText, deleteAdminFillBlankText, fetchAdminChallenge, fetchAdminFillBlankTexts, fetchAdminMathColumnsSettings, fetchAdminStages, fetchAdminStats, updateAdminChallenge, updateAdminFillBlankPercent, updateAdminFillBlankText, updateMathColumnsSettings } from '../api/client';
import type { DailyChallengeAdmin, FillBlankText, GameSettings, StageCompletion, UserStatsRow } from '../types';
import { PLANETS } from '../shared/planets';
import { captchaFieldHtml, setupCaptcha } from '../shared/captcha';
import { getAdminToken, setAdminToken, clearAdminToken } from '../shared/user';

const app = document.getElementById('admin-app');
if (!app) throw new Error('admin-app not found');

const GAME_NAMES: Record<string, string> = {
  'tower-defense': '🌻 Защита от зомби',
  'math-columns': '📐 Столбик',
  'fill-blanks': '📝 Заполни пропуски',
  'disassemble': '🔧 Разбери и собери',
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
        ${captchaFieldHtml()}
        <button type="submit" class="admin-btn">Войти</button>
      </form>
      <p class="admin-error hidden" id="login-error"></p>
      <a href="/" class="admin-back">← На главную</a>
    </div>
  `;

  const form = appEl.querySelector<HTMLFormElement>('#login-form')!;
  const errorEl = appEl.querySelector<HTMLParagraphElement>('#login-error')!;

  let captchaCtrl: Awaited<ReturnType<typeof setupCaptcha>> | null = null;
  void setupCaptcha(appEl).then(ctrl => { captchaCtrl = ctrl; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!captchaCtrl) return;
    const login = (appEl.querySelector('#login') as HTMLInputElement).value;
    const password = (appEl.querySelector('#password') as HTMLInputElement).value;
    try {
      const token = await adminLogin(login, password, captchaCtrl.getValues());
      setAdminToken(token);
      void loadDashboard(token);
    } catch (err) {
      await captchaCtrl.refresh();
      const message = err instanceof Error ? err.message : 'Ошибка входа';
      errorEl.textContent = message.toLowerCase().includes('captcha')
        ? 'Фигурка не совпала — сдвиньте точнее'
        : message;
      errorEl.classList.remove('hidden');
    }
  });
}

function gradeSelectHtml(userId: number, grade: number | null | undefined): string {
  const options = Array.from({ length: 11 }, (_, i) => {
    const g = i + 1;
    const selected = grade === g ? ' selected' : '';
    return `<option value="${g}"${selected}>${g}</option>`;
  }).join('');
  const emptySelected = grade == null ? ' selected' : '';
  return `
    <select class="admin-grade-select" data-user-id="${userId}">
      <option value=""${emptySelected}>—</option>
      ${options}
    </select>
  `;
}

function renderUserActions(userId: number, login: string, grade: number | null | undefined, rowspan: number): string {
  return `
    <td rowspan="${rowspan}" class="admin-actions-cell">
      <div class="admin-user-controls">
        <label class="admin-grade-label">
          Класс
          ${gradeSelectHtml(userId, grade)}
        </label>
        <button type="button" class="admin-btn admin-btn--danger admin-delete-btn"
          data-user-id="${userId}" data-user-login="${login}">Удалить</button>
      </div>
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
          ${renderUserActions(user.userId, user.login, user.grade, 1)}
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
        ${i === 0 ? renderUserActions(user.userId, user.login, user.grade, rowSpan) : ''}
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
            <th>Класс / действия</th>
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
      <td>#${s.stage}</td>
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
            <th>Вызов</th>
            <th>Планета</th>
            <th>Код</th>
            <th>Награда</th>
            <th>Подтверждён</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          ${stageRows || '<tr><td colspan="7" class="admin-empty">Пока нет наград</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderFillTextsList(texts: FillBlankText[]): string {
  if (texts.length === 0) {
    return '<p class="admin-empty">Текстов пока нет — добавьте первый</p>';
  }
  return `
    <ul class="admin-text-list">
      ${texts.map(t => `
        <li class="admin-text-item" data-id="${t.id}">
          <div class="admin-text-main">
            <div class="admin-text-top">
              <p class="admin-text-preview">${escapeHtml(t.preview)}</p>
              <div class="admin-text-actions">
                <button type="button" class="admin-btn admin-btn--ghost admin-fill-expand"
                  data-id="${t.id}" title="Показать весь текст" aria-expanded="false">▼</button>
                <button type="button" class="admin-btn admin-btn--danger admin-fill-delete"
                  data-id="${t.id}">Удалить</button>
              </div>
            </div>
            <div class="admin-text-editor hidden" data-editor-for="${t.id}">
              <textarea class="admin-fill-edit" rows="5">${escapeHtml(t.body ?? '')}</textarea>
              <div class="admin-text-editor-actions">
                <button type="button" class="admin-btn admin-fill-save" data-id="${t.id}">Сохранить</button>
                <span class="admin-fill-save-status" data-status-for="${t.id}"></span>
              </div>
            </div>
            <label class="admin-percent-field">
              <span class="admin-percent-label">Пропусков: <strong data-percent-value>${t.blankPercent}%</strong></span>
              <input type="range" class="admin-percent-slider" min="10" max="90" step="5"
                value="${t.blankPercent}" data-id="${t.id}">
            </label>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CHALLENGE_GAME_OPTIONS: { id: string; label: string }[] = [
  { id: 'math-columns', label: '📐 Столбик' },
  { id: 'fill-blanks', label: '📝 Заполни пропуски' },
  { id: 'tower-defense', label: '🌻 Защита от зомби' },
  { id: 'disassemble', label: '🔧 Разбери и собери' },
];

function renderSettingsTab(
  mathSettings: GameSettings | null,
  fillTexts: FillBlankText[],
  challenge: DailyChallengeAdmin | null,
): string {
  const selected = new Set((challenge?.games ?? []).map(g => g.gameId));
  const checks = CHALLENGE_GAME_OPTIONS.map(g => `
    <label class="admin-check">
      <input type="checkbox" name="challenge-game" value="${g.id}" ${selected.has(g.id) ? 'checked' : ''}>
      ${g.label}
    </label>
  `).join('');

  return `
    <section class="admin-section">
      <h2>🎯 Вызов дня</h2>
      <p class="admin-section__hint">Отметьте игры, которые ученик должен пройти. После всех — код с планетой.</p>
      <form id="challenge-form" class="admin-challenge-form">
        <div class="admin-check-list">${checks}</div>
        <button type="submit" class="admin-btn">Сохранить вызов</button>
      </form>
      <p class="admin-verify-result hidden" id="challenge-result"></p>
    </section>

    <section class="admin-section">
      <h2>📐 Столбик</h2>
      <p class="admin-section__hint">Длина чисел в примерах и сколько правильных ответов нужно для серии</p>
      <form id="settings-form" class="admin-verify-form">
        <label class="admin-field">
          <span>Знаков в числе (1–6)</span>
          <input type="number" id="digit-count" min="1" max="6"
            value="${mathSettings?.digitCount ?? 2}" required>
        </label>
        <label class="admin-field">
          <span>Примеров в серии</span>
          <input type="number" id="session-size" min="1" max="200"
            value="${mathSettings?.sessionSize ?? 50}" required>
        </label>
        <button type="submit" class="admin-btn">Сохранить</button>
      </form>
      <p class="admin-verify-result hidden" id="settings-result"></p>
    </section>

    <section class="admin-section">
      <h2>📝 Заполни пропуски</h2>
      <p class="admin-section__hint">Добавьте полный текст. Если больше 30 слов — разобьётся на абзацы/предложения; у каждого — свой список слов справа.</p>
      <form id="fill-text-form" class="admin-fill-form">
        <textarea id="fill-text-input" rows="5" placeholder="Вставьте текст скороговорки или предложения…" required></textarea>
        <button type="submit" class="admin-btn">Добавить текст</button>
      </form>
      <p class="admin-verify-result hidden" id="fill-text-result"></p>
      <h3 class="admin-subtitle">Тексты в игре</h3>
      ${renderFillTextsList(fillTexts)}
    </section>
  `;
}

function renderVerifyTab(stages: StageCompletion[]): string {
  const planetOptions = PLANETS.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join('');

  const challengeStages = stages.filter(s => s.gameId === 'daily-challenge');

  return `
    <section class="admin-section">
      <h2>🔍 Проверка кода вызова дня</h2>
      <p class="admin-section__hint">Спросите у ребёнка планету и двузначную цифру после прохождения всех игр вызова</p>
      <form id="verify-form" class="admin-verify-form">
        <input type="text" id="verify-login" placeholder="Логин пользователя" required>
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
      <h2>🪐 Награды за вызов дня</h2>
      ${renderStagesTable(challengeStages)}
    </section>
  `;
}

function renderDashboard(
  token: string,
  rows: UserStatsRow[],
  stages: StageCompletion[],
  mathSettings: GameSettings | null,
  fillTexts: FillBlankText[],
  challenge: DailyChallengeAdmin | null,
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
      ${renderSettingsTab(mathSettings, fillTexts, challenge)}
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
    const planet = (appEl.querySelector('#verify-planet') as HTMLSelectElement).value;
    const code = Number((appEl.querySelector('#verify-code') as HTMLInputElement).value);

    try {
      const result = await adminVerify(token, {
        userLogin,
        gameId: 'daily-challenge',
        stage: 0,
        planet,
        code,
      });
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

  appEl.querySelector<HTMLFormElement>('#challenge-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = appEl.querySelector<HTMLParagraphElement>('#challenge-result')!;
    const gameIds = [...appEl.querySelectorAll<HTMLInputElement>('input[name="challenge-game"]:checked')]
      .map(el => el.value);
    try {
      const saved = await updateAdminChallenge(token, gameIds);
      resultEl.textContent = `Вызов сохранён: ${saved.games.length} игр`;
      resultEl.className = 'admin-verify-result admin-verify-result--ok';
    } catch (err) {
      resultEl.textContent = err instanceof Error ? err.message : 'Ошибка сохранения';
      resultEl.className = 'admin-verify-result admin-verify-result--fail';
    }
  });

  appEl.querySelector<HTMLFormElement>('#settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = appEl.querySelector<HTMLParagraphElement>('#settings-result')!;
    const sessionSize = Number((appEl.querySelector('#session-size') as HTMLInputElement).value);
    const digitCount = Number((appEl.querySelector('#digit-count') as HTMLInputElement).value);

    try {
      const settings = await updateMathColumnsSettings(token, sessionSize, digitCount);
      resultEl.textContent = `Сохранено: ${settings.digitCount} знаков, ${settings.sessionSize} примеров в серии`;
      resultEl.className = 'admin-verify-result admin-verify-result--ok';
    } catch (err) {
      resultEl.textContent = err instanceof Error ? err.message : 'Ошибка сохранения';
      resultEl.className = 'admin-verify-result admin-verify-result--fail';
    }
  });

  appEl.querySelector<HTMLFormElement>('#fill-text-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = appEl.querySelector<HTMLParagraphElement>('#fill-text-result')!;
    const input = appEl.querySelector<HTMLTextAreaElement>('#fill-text-input')!;
    const text = input.value.trim();
    try {
      await addAdminFillBlankText(token, text);
      input.value = '';
      resultEl.textContent = 'Текст добавлен';
      resultEl.className = 'admin-verify-result admin-verify-result--ok';
      setActiveTab('settings');
      void loadDashboard(token);
    } catch (err) {
      resultEl.textContent = err instanceof Error ? err.message : 'Ошибка добавления';
      resultEl.className = 'admin-verify-result admin-verify-result--fail';
    }
  });

  appEl.querySelectorAll<HTMLButtonElement>('.admin-fill-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const editor = appEl.querySelector<HTMLElement>(`.admin-text-editor[data-editor-for="${id}"]`);
      if (!editor) return;
      const open = editor.classList.toggle('hidden') === false;
      btn.textContent = open ? '▲' : '▼';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.title = open ? 'Скрыть текст' : 'Показать весь текст';
    });
  });

  appEl.querySelectorAll<HTMLButtonElement>('.admin-fill-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const item = btn.closest('.admin-text-item');
      const textarea = item?.querySelector<HTMLTextAreaElement>('.admin-fill-edit');
      const status = appEl.querySelector<HTMLElement>(`[data-status-for="${id}"]`);
      const preview = item?.querySelector<HTMLElement>('.admin-text-preview');
      if (!textarea) return;
      void updateAdminFillBlankText(token, id, textarea.value.trim())
        .then(updated => {
          if (preview) preview.textContent = updated.preview;
          if (textarea) textarea.value = updated.body ?? textarea.value;
          if (status) {
            status.textContent = 'Сохранено';
            status.className = 'admin-fill-save-status admin-fill-save-status--ok';
          }
        })
        .catch(err => {
          if (status) {
            status.textContent = err instanceof Error ? err.message : 'Ошибка сохранения';
            status.className = 'admin-fill-save-status admin-fill-save-status--fail';
          }
        });
    });
  });

  appEl.querySelectorAll<HTMLButtonElement>('.admin-fill-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      if (!confirm('Удалить этот текст?')) return;
      void deleteAdminFillBlankText(token, id)
        .then(() => {
          setActiveTab('settings');
          void loadDashboard(token);
        })
        .catch(err => {
          alert(err instanceof Error ? err.message : 'Не удалось удалить');
        });
    });
  });

  const percentTimers = new Map<number, number>();
  appEl.querySelectorAll<HTMLInputElement>('.admin-percent-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const item = slider.closest('.admin-text-item');
      const label = item?.querySelector<HTMLElement>('[data-percent-value]');
      if (label) label.textContent = `${slider.value}%`;
    });
    slider.addEventListener('change', () => {
      const id = Number(slider.dataset.id);
      const blankPercent = Number(slider.value);
      const prev = percentTimers.get(id);
      if (prev) window.clearTimeout(prev);
      const timer = window.setTimeout(() => {
        void updateAdminFillBlankPercent(token, id, blankPercent).catch(err => {
          alert(err instanceof Error ? err.message : 'Не удалось сохранить процент');
        });
      }, 200);
      percentTimers.set(id, timer);
    });
  });

  appEl.querySelectorAll<HTMLSelectElement>('.admin-grade-select').forEach(select => {
    select.addEventListener('change', () => {
      const userId = Number(select.dataset.userId);
      const grade = Number(select.value);
      if (!userId || !grade) {
        select.value = '';
        return;
      }
      select.disabled = true;
      void adminSetUserGrade(token, userId, grade)
        .then(() => {
          select.disabled = false;
        })
        .catch(err => {
          select.disabled = false;
          alert(err instanceof Error ? err.message : 'Не удалось сохранить класс');
          void loadDashboard(token);
        });
    });
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
  renderDashboard(token, [], [], null, [], null, undefined, true);
  setActiveTab(activeTab);

  const [statsResult, stagesResult, settingsResult, fillTextsResult, challengeResult] = await Promise.allSettled([
    fetchAdminStats(token),
    fetchAdminStages(token),
    fetchAdminMathColumnsSettings(token),
    fetchAdminFillBlankTexts(token),
    fetchAdminChallenge(token),
  ]);

  const unauthorized = [statsResult, stagesResult, settingsResult, fillTextsResult, challengeResult].some(
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
  const fillTexts = fillTextsResult.status === 'fulfilled' ? fillTextsResult.value : [];
  const challenge = challengeResult.status === 'fulfilled' ? challengeResult.value : null;

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
  if (fillTextsResult.status === 'rejected') {
    const msg = fillTextsResult.reason instanceof Error ? fillTextsResult.reason.message : 'не удалось загрузить тексты';
    errors.push(msg);
  }
  if (challengeResult.status === 'rejected') {
    const msg = challengeResult.reason instanceof Error ? challengeResult.reason.message : 'не удалось загрузить вызов дня';
    errors.push(msg);
  }

  renderDashboard(
    token,
    rows,
    stages,
    mathSettings,
    fillTexts,
    challenge,
    errors.length ? `⚠️ ${errors.join('; ')}` : undefined,
  );
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
