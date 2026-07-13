import type { CaptchaChallenge, CaptchaPayload, GameCatalogItem, GameSettings, MathCheckResult, MathProblem, OpMode, StageCompletion, StatsDelta, User, UserStatsRow, VerifyResult } from '../types';

const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Сервер не отвечает. Проверьте, что PostgreSQL запущен и выполните ./run.sh');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function fetchGames(): Promise<GameCatalogItem[]> {
  return request<GameCatalogItem[]>('/api/games');
}

export function fetchCaptcha(): Promise<CaptchaChallenge> {
  return request<CaptchaChallenge>('/api/captcha');
}

export function fetchMathProblem(level: number, op: OpMode): Promise<MathProblem> {
  return request<MathProblem>('/api/math/problem', {
    method: 'POST',
    body: JSON.stringify({ level, op }),
  });
}

export function checkMathAnswer(id: string, answer: number): Promise<MathCheckResult> {
  return request<MathCheckResult>('/api/math/check', {
    method: 'POST',
    body: JSON.stringify({ id, answer }),
  });
}

export function loginUser(login: string, password: string | undefined, captcha: CaptchaPayload): Promise<User> {
  return request<User>('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({
      login,
      password: password ?? '',
      captchaId: captcha.captchaId,
      captchaAnswer: captcha.captchaAnswer,
    }),
  });
}

export function setUserPassword(userId: number, password: string, currentPassword?: string): Promise<User> {
  return request<User>('/api/users/password', {
    method: 'PUT',
    body: JSON.stringify({
      userId,
      password,
      currentPassword: currentPassword ?? '',
    }),
  });
}

export function sendStats(delta: StatsDelta): Promise<void> {
  return request<{ status: string }>('/api/stats', {
    method: 'POST',
    body: JSON.stringify({
      userId: delta.userId,
      gameId: delta.gameId,
      correct: delta.correct ?? 0,
      wrong: delta.wrong ?? 0,
      sessionsCompleted: delta.sessionsCompleted ?? 0,
      gamesWon: delta.gamesWon ?? 0,
      gamesLost: delta.gamesLost ?? 0,
    }),
  }).then(() => undefined);
}

export function adminLogin(
  login: string,
  password: string,
  captcha: CaptchaPayload,
): Promise<string> {
  return request<{ token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      login,
      password,
      captchaId: captcha.captchaId,
      captchaAnswer: captcha.captchaAnswer,
    }),
  }).then(r => r.token);
}

export function fetchAdminStats(token: string): Promise<UserStatsRow[]> {
  return request<UserStatsRow[]>('/api/admin/stats', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function completeStage(userId: number, gameId: string, stage: number): Promise<StageCompletion> {
  return request<StageCompletion>('/api/stages/complete', {
    method: 'POST',
    body: JSON.stringify({ userId, gameId, stage }),
  });
}

export function fetchAdminStages(token: string): Promise<StageCompletion[]> {
  return request<StageCompletion[]>('/api/admin/stages', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminVerify(
  token: string,
  data: { userLogin: string; gameId: string; stage: number; planet: string; code: number },
): Promise<VerifyResult> {
  return request<VerifyResult>('/api/admin/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export function fetchMathColumnsSettings(): Promise<GameSettings> {
  return request<GameSettings>('/api/settings/math-columns');
}

export function fetchAdminMathColumnsSettings(token: string): Promise<GameSettings> {
  return request<GameSettings>('/api/admin/settings/math-columns', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateMathColumnsSettings(token: string, sessionSize: number): Promise<GameSettings> {
  return request<GameSettings>('/api/admin/settings/math-columns', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionSize }),
  });
}

export function adminDeleteUser(token: string, userId: number): Promise<void> {
  return request<{ status: string }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(() => undefined);
}
