import { loginUser } from '../api/client';
import type { User } from '../types';
import { getUser, setUser } from './user';
import './modal.css';

export async function ensureUserLogin(): Promise<User> {
  const existing = getUser();
  if (existing) return existing;
  return promptUserLogin();
}

export function promptUserLogin(): Promise<User> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Добро пожаловать!</h2>
        <p>Введите логин, чтобы сохранять прогресс</p>
        <form id="user-login-form">
          <input type="text" id="user-login-input" placeholder="Ваш логин" maxlength="64" required autofocus>
          <button type="submit" class="modal-btn modal-btn--primary">Войти</button>
        </form>
        <p class="modal-error hidden" id="user-login-error"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector<HTMLFormElement>('#user-login-form')!;
    const input = overlay.querySelector<HTMLInputElement>('#user-login-input')!;
    const errorEl = overlay.querySelector<HTMLParagraphElement>('#user-login-error')!;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = input.value.trim();
      if (!login) return;

      errorEl.classList.add('hidden');
      try {
        const user = await loginUser(login);
        setUser(user);
        overlay.remove();
        resolve(user);
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : 'Ошибка входа';
        errorEl.classList.remove('hidden');
      }
    });
  });
}

export function showAdminLoginModal(onSuccess: (token: string) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Администратор</h2>
      <form id="admin-login-form">
        <input type="text" id="admin-login" placeholder="Логин" required autofocus>
        <input type="password" id="admin-password" placeholder="Пароль" required>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn--ghost" id="admin-cancel">Отмена</button>
          <button type="submit" class="modal-btn modal-btn--primary">Войти</button>
        </div>
      </form>
      <p class="modal-error hidden" id="admin-login-error"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector<HTMLFormElement>('#admin-login-form')!;
  const errorEl = overlay.querySelector<HTMLParagraphElement>('#admin-login-error')!;

  overlay.querySelector('#admin-cancel')?.addEventListener('click', () => overlay.remove());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = (overlay.querySelector('#admin-login') as HTMLInputElement).value;
    const password = (overlay.querySelector('#admin-password') as HTMLInputElement).value;

    try {
      const { adminLogin } = await import('../api/client');
      const token = await adminLogin(login, password);
      overlay.remove();
      onSuccess(token);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Неверный логин или пароль';
      errorEl.classList.remove('hidden');
    }
  });
}
