export interface GameCatalogItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  url: string;
  available: boolean;
  tags: string[];
  minGrade?: number;
  maxGrade?: number;
}

export interface MathProblem {
  id: string;
  a: number;
  b: number;
  op: string;
  width: number;
  options: number[];
}

export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  login: string;
  role?: UserRole;
  grade?: number | null;
  avatar?: string | null;
  hasPassword?: boolean;
  createdAt: string;
  adminToken?: string;
}

export interface CaptchaChallenge {
  id: string;
  background: string;
  piece: string;
  pieceY: number;
  trackWidth: number;
  pieceWidth: number;
  imageHeight: number;
}

export interface CaptchaPayload {
  captchaId: string;
  captchaAnswer: number;
}

export interface GameStats {
  gameId: string;
  correct: number;
  wrong: number;
  sessionsCompleted: number;
  gamesWon: number;
  gamesLost: number;
  updatedAt: string;
}

export interface UserStatsRow {
  userId: number;
  login: string;
  role?: string;
  grade?: number | null;
  createdAt: string;
  fractionsTutorialDone?: boolean;
  games: GameStats[];
}

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

export interface MathCheckResult {
  correct: boolean;
  correctAnswer?: number;
  sessionSolved?: number;
  sessionComplete?: boolean;
  stageCompletion?: StageCompletion;
}

export interface MathSessionProgress {
  solved: number;
  correct: number;
  wrong: number;
  complete: boolean;
  sessionSize: number;
  day: string;
}

export interface FractionsSessionProgress {
  correct: number;
  wrong: number;
  solved: number;
  complete?: boolean;
  sessionSize?: number;
  day: string;
  rankTitle: string;
}

export interface VerifyResult {
  verified: boolean;
  message: string;
}

export interface GameSettings {
  gameId: string;
  sessionSize: number;
  digitCount: number;
}

export interface GameGrade {
  gameId: string;
  minGrade: number;
  maxGrade: number;
}

export interface GameEnabled {
  gameId: string;
  enabled: boolean;
  title?: string;
}

export interface UserGameAccess {
  gameId: string;
  enabled: boolean;
  override: boolean;
  title?: string;
}

export interface FillBlanksToken {
  type: 'text' | 'blank';
  value?: string;
  index?: number;
}

export interface FillBlanksParagraph {
  tokens: FillBlanksToken[];
  words: string[];
  blankCount: number;
}

export interface FillBlanksPuzzle {
  id: string;
  paragraphs: FillBlanksParagraph[];
  blankCount: number;
}

export interface FillBlanksCheckResult {
  correct: boolean;
  sessionSolved?: number;
  sessionComplete?: boolean;
  challengeReward?: StageCompletion;
}

export interface FractionProblem {
  id: string;
  grade: number;
  kind: string;
  title: string;
  prompt: string;
  payload: Record<string, unknown>;
}

export interface FractionVisualHint {
  parts?: number;
  take?: number;
  label?: string;
}

export interface FractionCheckResult {
  correct: boolean;
  visualHint?: FractionVisualHint;
  rankTitle?: string;
  dayCorrect?: number;
  dayWrong?: number;
  sessionSolved?: number;
  sessionComplete?: boolean;
  challengeReward?: StageCompletion;
}

export interface ChallengeGameItem {
  gameId: string;
  title?: string;
  url?: string;
  position: number;
  done: boolean;
}

export interface ChallengeDayProgress {
  date: string;
  label: string;
  done: boolean;
  isReward?: boolean;
}

export interface ChallengeWeekProgress {
  days: ChallengeDayProgress[];
  wins: number;
  praise: string;
}

export interface ChallengeStatus {
  challenge?: { id: number; createdAt: string } | null;
  games: ChallengeGameItem[];
  completed: number;
  total: number;
  allDone: boolean;
  reward?: StageCompletion;
  week?: ChallengeWeekProgress;
}

export interface DailyChallengeAdmin {
  id?: number;
  games: ChallengeGameItem[];
  rewardRub?: number;
  createdAt?: string;
}

export interface FillBlankText {
  id: number;
  preview: string;
  blankPercent: number;
  createdAt: string;
  body: string;
}

export type OpMode = 'add' | 'sub' | 'mixed';
export type PlantType = 'sunflower' | 'peashooter' | 'wallnut' | 'cherrybomb';
export type ZombieType = 'normal' | 'cone' | 'bucket';
export type GameState = 'playing' | 'won' | 'lost';
