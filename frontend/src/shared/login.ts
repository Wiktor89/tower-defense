import { loginUser, setUserPassword } from '../api/client';
import type { User } from '../types';
import { captchaFieldHtml, setupCaptcha } from './captcha';
import { clearUser, getUser, setUser } from './user';
import './modal.css';

export async function ensureUserLogin(): Promise<User> {
  const existing = getUser();
  if (existing?.hasPassword && existing.role) return existing;
  if (existing) clearUser();
  return promptUserLogin();
}

export function promptUserLogin(): Promise<User> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Добро пожаловать!</h2>
        <p>Введите логин и пароль. Новый логин создаст аккаунт.</p>
        <form id="user-login-form">
          <input type="text" id="user-login-input" placeholder="Ваш логин" maxlength="64" required autofocus>
          <input type="password" id="user-password-input" placeholder="Пароль (мин. 4 символа)" minlength="4" required>
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
    const errorEl = overlay.querySelector<HTMLParagraphElement>('#user-login-error')!;

    let captchaCtrl: Awaited<ReturnType<typeof setupCaptcha>> | null = null;
    void setupCaptcha(overlay).then(ctrl => { captchaCtrl = ctrl; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = input.value.trim();
      const password = passwordInput.value;
      if (!login || !captchaCtrl) return;

      errorEl.classList.add('hidden');
      try {
        const user = await loginUser(login, password, captchaCtrl.getValues());
        setUser(user);
        overlay.remove();
        resolve(getUser() ?? user);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка входа';
        await captchaCtrl.refresh();
        if (message.toLowerCase().includes('password required')) {
          errorEl.textContent = 'Пароль обязателен';
        } else if (message.toLowerCase().includes('at least 4')) {
          errorEl.textContent = 'Пароль должен быть не короче 4 символов';
        } else if (message.toLowerCase().includes('invalid password')) {
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
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Сменить пароль</h2>
      <p>Введите текущий и новый пароль</p>
      <form id="user-password-form">
        <input type="password" id="current-password" placeholder="Текущий пароль" required>
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
    const currentPassword = (overlay.querySelector('#current-password') as HTMLInputElement).value;

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
