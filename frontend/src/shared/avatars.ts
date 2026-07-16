export interface AvatarOption {
  id: string;
  emoji: string;
  name: string;
}

export const AVATARS: readonly AvatarOption[] = [
  { id: 'bunny', emoji: '🐰', name: 'Зайчик' },
  { id: 'kitten', emoji: '🐱', name: 'Котик' },
  { id: 'puppy', emoji: '🐶', name: 'Щенок' },
  { id: 'fox', emoji: '🦊', name: 'Лисичка' },
  { id: 'panda', emoji: '🐼', name: 'Панда' },
] as const;

export const DEFAULT_AVATAR_ID = 'bunny';

export function getAvatar(id: string | null | undefined): AvatarOption {
  return AVATARS.find(a => a.id === id) ?? AVATARS[0]!;
}
