import type { User } from '../types';

const USER_KEY = 'games_user';
const ADMIN_TOKEN_KEY = 'games_admin_token';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  const { adminToken, ...safe } = user;
  localStorage.setItem(USER_KEY, JSON.stringify(safe));
  if (adminToken) {
    setAdminToken(adminToken);
  } else if (safe.role !== 'admin') {
    clearAdminToken();
  }
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
  clearAdminToken();
}

export function isAdminUser(user: User | null = getUser()): boolean {
  return user?.role === 'admin';
}
