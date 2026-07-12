import type { GameCatalogItem, MathCheckResult, MathProblem, OpMode, StageCompletion, StatsDelta, User, UserStatsRow, VerifyResult } from '../types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchGames(): Promise<GameCatalogItem[]> {
  return request<GameCatalogItem[]>('/api/games');
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

export function loginUser(login: string): Promise<User> {
  return request<User>('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ login }),
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

export function adminLogin(login: string, password: string): Promise<string> {
  return request<{ token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
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
