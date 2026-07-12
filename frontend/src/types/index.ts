export interface GameCatalogItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  url: string;
  available: boolean;
  tags: string[];
}

export interface MathProblem {
  id: string;
  a: number;
  b: number;
  op: string;
  width: number;
}

export interface MathCheckResult {
  correct: boolean;
  correctAnswer?: number;
}

export type OpMode = 'add' | 'sub' | 'mixed';
export type PlantType = 'sunflower' | 'peashooter' | 'wallnut' | 'cherrybomb';
export type ZombieType = 'normal' | 'cone' | 'bucket';
export type GameState = 'playing' | 'won' | 'lost';
