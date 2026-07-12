import type { GameCatalogItem, MathCheckResult, MathProblem, OpMode } from '../types';

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
