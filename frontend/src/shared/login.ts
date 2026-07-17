import { fetchUser, loginUser, registerUser, setUserPassword } from '../api/client';
import type { User } from '../types';
import { captchaFieldHtml, setupCaptcha } from './captcha';
import { startIdleLogout, touchActivity } from './idle-logout';
import { clearUser, getUser, setUser } from './user';
import './modal.css';

function authErrorMessage(message: string, mode: 'login' | 'register'): string {
  const lower = message.toLowerCase();
  if (lower.includes('password required')) return 'Пароль обязателен';
  if (lower.includes('at least 4')) return 'Пароль должен быть не короче 4 символов';
  if (lower.includes('invalid password')) return 'Неверный пароль';
  if (lower.includes('user not found')) return 'Такого логина нет. Зарегистрируйтесь.';
  if (lower.includes('login already taken') || lower.includes('already taken')) {
    return 'Такой логин уже занят';
  }
  if (lower.includes('invalid captcha') || lower.includes('captcha')) {
    return 'Фигурка не совпала — сдвиньте точнее';
  }
  if (mode === 'register' && lower.includes('login is required')) return 'Введите логин';
  return message;
}

export async function ensureUserLogin(): Promise<User> {
  const existing = getUser();
  if (existing?.hasPassword && existing.role && existing.id > 0) {
    try {
      const fresh = await fetchUser(existing.id);
      setUser(fresh);
      startIdleLogout();
      return fresh;
    } catch {
      // сессия в localStorage устарела (БД сброшена / пользователь удалён)
      clearUser();
    }
  } else if (existing) {
    clearUser();
  }
  return promptUserLogin();
}

export function promptUserLogin(): Promise<User> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Добро пожаловать!</h2>
        <p id="auth-hint">Введите логин и пароль, чтобы войти.</p>
        <form id="user-login-form">
          <input type="text" id="user-login-input" placeholder="Ваш логин" maxlength="64" required autofocus>
          <input type="password" id="user-password-input" placeholder="Пароль (мин. 4 символа)" minlength="4" required>
          ${captchaFieldHtml()}
          <div class="modal-actions modal-actions--stack">
            <button type="submit" class="modal-btn modal-btn--primary" id="auth-submit">Войти</button>
            <button type="button" class="modal-btn modal-btn--ghost" id="auth-toggle">Зарегистрироваться</button>
          </div>
        </form>
        <p class="modal-error hidden" id="user-login-error"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector<HTMLFormElement>('#user-login-form')!;
    const input = overlay.querySelector<HTMLInputElement>('#user-login-input')!;
    const passwordInput = overlay.querySelector<HTMLInputElement>('#user-password-input')!;
    const errorEl = overlay.querySelector<HTMLParagraphElement>('#user-login-error')!;
    const hintEl = overlay.querySelector<HTMLParagraphElement>('#auth-hint')!;
    const submitBtn = overlay.querySelector<HTMLButtonElement>('#auth-submit')!;
    const toggleBtn = overlay.querySelector<HTMLButtonElement>('#auth-toggle')!;

    let mode: 'login' | 'register' = 'login';
    let captchaCtrl: Awaited<ReturnType<typeof setupCaptcha>> | null = null;
    void setupCaptcha(overlay).then(ctrl => { captchaCtrl = ctrl; });

    const setMode = (next: 'login' | 'register'): void => {
      mode = next;
      errorEl.classList.add('hidden');
      if (mode === 'login') {
        hintEl.textContent = 'Введите логин и пароль, чтобы войти.';
        submitBtn.textContent = 'Войти';
        toggleBtn.textContent = 'Зарегистрироваться';
      } else {
        hintEl.textContent = 'Создайте логин и пароль. Регистр букв не важен: Арина и аРиНа — один логин.';
        submitBtn.textContent = 'Создать аккаунт';
        toggleBtn.textContent = 'Уже есть аккаунт? Войти';
      }
    };

    toggleBtn.addEventListener('click', () => {
      setMode(mode === 'login' ? 'register' : 'login');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = input.value.trim();
      const password = passwordInput.value;
      if (!login || !captchaCtrl) return;

      errorEl.classList.add('hidden');
      try {
        const user = mode === 'register'
          ? await registerUser(login, password, captchaCtrl.getValues())
          : await loginUser(login, password, captchaCtrl.getValues());
        setUser(user);
        touchActivity();
        startIdleLogout();
        overlay.remove();
        resolve(getUser() ?? user);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка входа';
        await captchaCtrl.refresh();
        errorEl.textContent = authErrorMessage(message, mode);
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
