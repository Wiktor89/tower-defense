import type { CaptchaChallenge, CaptchaPayload, ChallengeStatus, DailyChallengeAdmin, FillBlankText, FillBlanksCheckResult, FillBlanksPuzzle, FractionCheckResult, FractionProblem, GameCatalogItem, GameGrade, GameSettings, MathCheckResult, MathProblem, StageCompletion, User, UserStatsRow, VerifyResult } from '../types';

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

export function fetchGames(userId?: number): Promise<GameCatalogItem[]> {
  const q = userId && userId > 0 ? `?userId=${userId}` : '';
  return request<GameCatalogItem[]>(`/api/games${q}`);
}

export function fetchChallenge(userId: number): Promise<ChallengeStatus> {
  return request<ChallengeStatus>(`/api/challenge?userId=${userId}`);
}

export function reportDisassembleComplete(userId: number): Promise<{ status: string; challengeReward?: StageCompletion }> {
  return request<{ status: string; challengeReward?: StageCompletion }>('/api/disassemble/complete', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function fetchAdminChallenge(token: string): Promise<DailyChallengeAdmin> {
  return request<DailyChallengeAdmin>('/api/admin/settings/daily-challenge', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateAdminChallenge(token: string, gameIds: string[]): Promise<DailyChallengeAdmin> {
  return request<DailyChallengeAdmin>('/api/admin/settings/daily-challenge', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameIds }),
  });
}

export function fetchCaptcha(): Promise<CaptchaChallenge> {
  return request<CaptchaChallenge>('/api/captcha');
}

export function fetchMathProblem(userId: number): Promise<MathProblem> {
  return request<MathProblem>('/api/math/problem', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function checkMathAnswer(id: string, answer: number, userId?: number): Promise<MathCheckResult> {
  return request<MathCheckResult>('/api/math/check', {
    method: 'POST',
    body: JSON.stringify({ id, answer, userId: userId ?? 0 }),
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

export function registerUser(login: string, password: string, captcha: CaptchaPayload): Promise<User> {
  return request<User>('/api/users/register', {
    method: 'POST',
    body: JSON.stringify({
      login,
      password,
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

export function setUserAvatar(userId: number, avatar: string): Promise<User> {
  return request<User>('/api/users/avatar', {
    method: 'PUT',
    body: JSON.stringify({ userId, avatar }),
  });
}

export interface TdSessionStart {
  sessionId: string;
  minDurationMs: number;
  minLossDurationMs: number;
}

export function startTowerDefense(userId: number): Promise<TdSessionStart> {
  return request<TdSessionStart>('/api/tower-defense/start', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function finishTowerDefense(
  sessionId: string,
  result: 'won' | 'lost',
): Promise<{ status: string; challengeReward?: StageCompletion }> {
  return request<{ status: string; challengeReward?: StageCompletion }>('/api/tower-defense/finish', {
    method: 'POST',
    body: JSON.stringify({ sessionId, result }),
  });
}

export function fetchFillBlanksPuzzle(): Promise<FillBlanksPuzzle> {
  return request<FillBlanksPuzzle>('/api/fill-blanks/puzzle');
}

export function checkFillBlanks(id: string, answers: string[], userId?: number): Promise<FillBlanksCheckResult> {
  return request<FillBlanksCheckResult>('/api/fill-blanks/check', {
    method: 'POST',
    body: JSON.stringify({ id, answers, userId: userId ?? 0 }),
  });
}

export function fetchFractionProblem(userId: number): Promise<FractionProblem> {
  return request<FractionProblem>('/api/fractions/problem', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function checkFractionAnswer(
  id: string,
  answer: number | string | { num: number; den: number },
  userId?: number,
): Promise<FractionCheckResult> {
  return request<FractionCheckResult>('/api/fractions/check', {
    method: 'POST',
    body: JSON.stringify({ id, answer, userId: userId ?? 0 }),
  });
}

export function fetchFractionsTutorial(userId: number): Promise<{ done: boolean }> {
  return request<{ done: boolean }>(`/api/fractions/tutorial?userId=${userId}`);
}

export function completeFractionsTutorial(userId: number): Promise<{ done: boolean }> {
  return request<{ done: boolean }>('/api/fractions/tutorial/complete', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function adminResetFractionsTutorial(token: string, userId: number): Promise<{ done: boolean }> {
  return request<{ done: boolean }>(`/api/admin/users/${userId}/fractions-tutorial`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function fetchAdminFillBlankTexts(token: string): Promise<FillBlankText[]> {
  return request<FillBlankText[]>('/api/admin/settings/fill-blanks', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function addAdminFillBlankText(token: string, text: string): Promise<FillBlankText> {
  return request<FillBlankText>('/api/admin/settings/fill-blanks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
}

export function deleteAdminFillBlankText(token: string, id: number): Promise<void> {
  return request<{ status: string }>(`/api/admin/settings/fill-blanks/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(() => undefined);
}

export function updateAdminFillBlankPercent(token: string, id: number, blankPercent: number): Promise<FillBlankText> {
  return request<FillBlankText>(`/api/admin/settings/fill-blanks/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ blankPercent }),
  });
}

export function updateAdminFillBlankText(token: string, id: number, text: string): Promise<FillBlankText> {
  return request<FillBlankText>(`/api/admin/settings/fill-blanks/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
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

export function updateMathColumnsSettings(
  token: string,
  sessionSize: number,
  digitCount: number,
): Promise<GameSettings> {
  return request<GameSettings>('/api/admin/settings/math-columns', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionSize, digitCount }),
  });
}

export function fetchAdminGameGrades(token: string): Promise<GameGrade[]> {
  return request<GameGrade[]>('/api/admin/settings/game-grades', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateAdminGameGrade(
  token: string,
  gameId: string,
  minGrade: number,
  maxGrade: number,
): Promise<GameGrade> {
  return request<GameGrade>('/api/admin/settings/game-grades', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, minGrade, maxGrade }),
  });
}

export function adminSetUserGrade(token: string, userId: number, grade: number): Promise<User> {
  return request<User>(`/api/admin/users/${userId}/grade`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ grade }),
  });
}

export function adminDeleteUser(token: string, userId: number): Promise<void> {
  return request<{ status: string }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(() => undefined);
}
