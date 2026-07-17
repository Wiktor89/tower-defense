import { clearUser, getUser } from './user';

const IDLE_MS = 15 * 60 * 1000;
const ACTIVITY_KEY = 'games_last_activity';
const CHECK_MS = 30_000;

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  'pointerdown',
  'keydown',
  'touchstart',
  'mousemove',
  'scroll',
  'wheel',
];

let started = false;
let timer: number | null = null;
let lastMoveAt = 0;

function now(): number {
  return Date.now();
}

export function touchActivity(): void {
  localStorage.setItem(ACTIVITY_KEY, String(now()));
}

function lastActivity(): number {
  const raw = localStorage.getItem(ACTIVITY_KEY);
  const t = raw ? Number(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

function logoutIdle(): void {
  if (!getUser()) return;
  clearUser();
  localStorage.removeItem(ACTIVITY_KEY);
  const onMenu = window.location.pathname === '/' || window.location.pathname === '/index.html';
  if (onMenu) {
    window.location.reload();
    return;
  }
  window.location.href = '/';
}

function checkIdle(): void {
  if (!getUser()) return;
  const last = lastActivity();
  if (!last) {
    touchActivity();
    return;
  }
  if (now() - last >= IDLE_MS) {
    logoutIdle();
  }
}

function onActivity(): void {
  if (!getUser()) return;
  const t = now();
  // throttle mousemove writes
  if (t - lastMoveAt < 1000) return;
  lastMoveAt = t;
  touchActivity();
}

/** Запускает таймер бездействия (15 мин). Безопасно вызывать повторно. */
export function startIdleLogout(): void {
  if (typeof window === 'undefined') return;
  if (!getUser()) return;

  checkIdle();
  if (!getUser()) return;
  if (!lastActivity()) touchActivity();

  if (started) return;
  started = true;

  for (const ev of ACTIVITY_EVENTS) {
    document.addEventListener(ev, onActivity, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkIdle();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === ACTIVITY_KEY || e.key === 'games_user') checkIdle();
  });

  timer = window.setInterval(checkIdle, CHECK_MS);
}

export function stopIdleLogout(): void {
  if (!started) return;
  started = false;
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  for (const ev of ACTIVITY_EVENTS) {
    document.removeEventListener(ev, onActivity, true);
  }
}
