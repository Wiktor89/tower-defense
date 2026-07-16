import { setUserAvatar } from '../api/client';
import type { User } from '../types';
import { AVATARS, getAvatar } from './avatars';
import { getUser, setUser } from './user';
import './modal.css';

export function showAvatarPicker(onSaved?: (user: User) => void): void {
  const current = getUser();
  if (!current) return;

  const hasAvatar = Boolean(current.avatar);
  const selectedId = hasAvatar ? getAvatar(current.avatar).id : '';
  const options = AVATARS.map(a => `
    <button type="button" class="avatar-option${a.id === selectedId ? ' avatar-option--active' : ''}"
      data-avatar="${a.id}" title="${a.name}">
      <span class="avatar-option__emoji">${a.emoji}</span>
      <span class="avatar-option__name">${a.name}</span>
    </button>
  `).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--avatars">
      <h2>${hasAvatar ? 'Сменить аватар' : 'Выберите аватар'}</h2>
      <p>${hasAvatar ? 'Милые зверюшки для вашего профиля' : 'Выберите зверюшку — без аватара дальше нельзя'}</p>
      <div class="avatar-grid">${options}</div>
      <p class="modal-error hidden" id="avatar-error"></p>
      ${hasAvatar
        ? '<button type="button" class="modal-btn modal-btn--ghost" id="avatar-cancel">Закрыть</button>'
        : ''}
    </div>
  `;
  document.body.appendChild(overlay);

  const errorEl = overlay.querySelector<HTMLParagraphElement>('#avatar-error')!;
  overlay.querySelector('#avatar-cancel')?.addEventListener('click', () => overlay.remove());
  if (hasAvatar) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  overlay.querySelectorAll<HTMLButtonElement>('.avatar-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const avatar = btn.dataset.avatar;
      if (!avatar) return;
      errorEl.classList.add('hidden');
      btn.disabled = true;
      void setUserAvatar(current.id, avatar)
        .then(updated => {
          setUser(updated);
          overlay.remove();
          onSaved?.(getUser() ?? updated);
        })
        .catch(err => {
          btn.disabled = false;
          errorEl.textContent = err instanceof Error ? err.message : 'Не удалось сохранить';
          errorEl.classList.remove('hidden');
        });
    });
  });
}
