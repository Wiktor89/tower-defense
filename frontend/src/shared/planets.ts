export interface StageCompletion {
  id: number;
  userId: number;
  userLogin?: string;
  gameId: string;
  stage: number;
  planet: string;
  planetName: string;
  code: number;
  rewardRub: number;
  verified: boolean;
  completedAt: string;
  verifiedAt?: string;
}

export interface VerifyResult {
  verified: boolean;
  message: string;
}

export const PLANETS = [
  { id: 'mercury', name: 'Меркурий', color: '#b5b5b5', orbit: 55, size: 10 },
  { id: 'venus', name: 'Венера', color: '#e8cda0', orbit: 75, size: 14 },
  { id: 'earth', name: 'Земля', color: '#6b9bd1', orbit: 95, size: 14 },
  { id: 'mars', name: 'Марс', color: '#c1440e', orbit: 115, size: 12 },
  { id: 'jupiter', name: 'Юпитер', color: '#c88b3a', orbit: 140, size: 22 },
  { id: 'saturn', name: 'Сатурн', color: '#e8d5a3', orbit: 168, size: 20 },
  { id: 'uranus', name: 'Уран', color: '#7de3f4', orbit: 192, size: 16 },
  { id: 'neptune', name: 'Нептун', color: '#3e54e8', orbit: 212, size: 16 },
] as const;
