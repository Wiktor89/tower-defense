import { loginUser, setUserPassword } from '../api/client';
import type { User } from '../types';
import { captchaFieldHtml, setupCaptcha } from './captcha';
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
          <input type="password" id="user-password-input" class="hidden" placeholder="Пароль">
          <p class="modal-hint hidden" id="user-password-hint">У этого пользователя задан пароль</p>
          ${captchaFieldHtml()}
          <button type="submit" class="modal-btn modal-btn--primary">Войти</button>
        </form>
        <p class="modal-error hidden" id="user-login-error"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector<HTMLFormElement>('#user-login-form')!;
    const input = overlay.querySelector<HTMLInputElement>('#user-login-input')!;
    const passwordInput = overlay.querySelector<HTMLInputElement>('#user-password-input')!;
    const passwordHint = overlay.querySelector<HTMLParagraphElement>('#user-password-hint')!;
    const errorEl = overlay.querySelector<HTMLParagraphElement>('#user-login-error')!;

    let captchaCtrl: Awaited<ReturnType<typeof setupCaptcha>> | null = null;
    void setupCaptcha(overlay).then(ctrl => { captchaCtrl = ctrl; });

    const showPasswordField = () => {
      passwordInput.classList.remove('hidden');
      passwordHint.classList.remove('hidden');
      passwordInput.required = true;
      passwordInput.focus();
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = input.value.trim();
      if (!login || !captchaCtrl) return;

      errorEl.classList.add('hidden');
      try {
        const user = await loginUser(login, passwordInput.value, captchaCtrl.getValues());
        setUser(user);
        overlay.remove();
        resolve(user);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка входа';
        await captchaCtrl.refresh();
        if (message.toLowerCase().includes('password required')) {
          showPasswordField();
          errorEl.textContent = 'Введите пароль для этого пользователя';
        } else if (message.toLowerCase().includes('invalid password')) {
          showPasswordField();
          errorEl.textContent = 'Неверный пароль';
        } else if (message.toLowerCase().includes('invalid captcha') || message.toLowerCase().includes('captcha')) {
          errorEl.textContent = 'Фигурка не совпала — сдвиньте точнее';
        } else {
          errorEl.textContent = message;
        }
        errorEl.classList.remove('hidden');
      }
    });
  });
}

export function showSetPasswordModal(user: User, onSuccess?: (user: User) => void): void {
  const hasPassword = !!user.hasPassword;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${hasPassword ? 'Сменить пароль' : 'Задать пароль'}</h2>
      <p>${hasPassword
        ? 'Введите текущий и новый пароль для защиты аккаунта'
        : 'Пароль не обязателен, но защитит ваш прогресс от других'}</p>
      <form id="user-password-form">
        ${hasPassword ? '<input type="password" id="current-password" placeholder="Текущий пароль" required>' : ''}
        <input type="password" id="new-password" placeholder="Новый пароль (мин. 4 символа)" minlength="4" required>
        <input type="password" id="confirm-password" placeholder="Повторите пароль" minlength="4" required>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn--ghost" id="password-cancel">Отмена</button>
          <button type="submit" class="modal-btn modal-btn--primary">Сохранить</button>
        </div>
      </form>
      <p class="modal-error hidden" id="password-error"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector<HTMLFormElement>('#user-password-form')!;
  const errorEl = overlay.querySelector<HTMLParagraphElement>('#password-error')!;

  overlay.querySelector('#password-cancel')?.addEventListener('click', () => overlay.remove());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = (overlay.querySelector('#new-password') as HTMLInputElement).value;
    const confirmPassword = (overlay.querySelector('#confirm-password') as HTMLInputElement).value;
    const currentPassword = hasPassword
      ? (overlay.querySelector('#current-password') as HTMLInputElement).value
      : undefined;

    if (newPassword !== confirmPassword) {
      errorEl.textContent = 'Пароли не совпадают';
      errorEl.classList.remove('hidden');
      return;
    }

    errorEl.classList.add('hidden');
    try {
      const updated = await setUserPassword(user.id, newPassword, currentPassword);
      setUser(updated);
      overlay.remove();
      onSuccess?.(updated);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Ошибка сохранения';
      errorEl.classList.remove('hidden');
    }
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
        ${captchaFieldHtml()}
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

  let captchaCtrl: Awaited<ReturnType<typeof setupCaptcha>> | null = null;
  void setupCaptcha(overlay).then(ctrl => { captchaCtrl = ctrl; });

  overlay.querySelector('#admin-cancel')?.addEventListener('click', () => overlay.remove());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!captchaCtrl) return;
    const login = (overlay.querySelector('#admin-login') as HTMLInputElement).value;
    const password = (overlay.querySelector('#admin-password') as HTMLInputElement).value;

    try {
      const { adminLogin } = await import('../api/client');
      const token = await adminLogin(login, password, captchaCtrl.getValues());
      overlay.remove();
      onSuccess(token);
    } catch (err) {
      await captchaCtrl.refresh();
      const message = err instanceof Error ? err.message : 'Неверный логин или пароль';
      errorEl.textContent = message.toLowerCase().includes('captcha')
        ? 'Фигурка не совпала — сдвиньте точнее'
        : message;
      errorEl.classList.remove('hidden');
    }
  });
}
