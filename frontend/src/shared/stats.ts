import { getUser } from '../shared/user';
import { sendStats } from '../api/client';

export async function reportStats(
  gameId: string,
  delta: Omit<import('../types').StatsDelta, 'userId' | 'gameId'>,
): Promise<void> {
  const user = getUser();
  if (!user) return;
  try {
    await sendStats({ userId: user.id, gameId, ...delta });
  } catch {
    // stats are best-effort
  }
}
