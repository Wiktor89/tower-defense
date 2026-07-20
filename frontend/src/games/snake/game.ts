export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export interface SnakeGameOptions {
  cols: number;
  rows: number;
  cell: number;
  tickMs: number;
  onEat: () => void | Promise<void>;
  onDie: () => void;
}

export class SnakeGame {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  private tickMs: number;
  private onEat: () => void | Promise<void>;
  private onDie: () => void;

  private snake: Point[] = [];
  private dir: Dir = 'right';
  private nextDir: Dir = 'right';
  private food: Point = { x: 0, y: 0 };
  private timer: number | null = null;
  private running = false;
  private eating = false;
  private roundApples = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    opts: SnakeGameOptions,
  ) {
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.cell = opts.cell;
    this.tickMs = opts.tickMs;
    this.onEat = opts.onEat;
    this.onDie = opts.onDie;
    this.canvas.width = this.cols * this.cell;
    this.canvas.height = this.rows * this.cell;
  }

  get length(): number {
    return this.snake.length;
  }

  get applesThisRound(): number {
    return this.roundApples;
  }

  get isRunning(): boolean {
    return this.running;
  }

  reset(): void {
    this.stop();
    const midY = Math.floor(this.rows / 2);
    const midX = Math.floor(this.cols / 2);
    this.snake = [
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY },
      { x: midX - 3, y: midY },
    ];
    this.dir = 'right';
    this.nextDir = 'right';
    this.roundApples = 0;
    this.eating = false;
    this.placeFood();
    this.draw();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = window.setInterval(() => void this.tick(), this.tickMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  setDirection(dir: Dir): void {
    if (OPPOSITE[dir] === this.dir) return;
    this.nextDir = dir;
  }

  private placeFood(): void {
    const occupied = new Set(this.snake.map(p => `${p.x},${p.y}`));
    const free: Point[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) {
      this.food = { x: 0, y: 0 };
      return;
    }
    this.food = free[Math.floor(Math.random() * free.length)]!;
  }

  private async tick(): Promise<void> {
    if (!this.running || this.eating) return;
    this.dir = this.nextDir;
    const head = this.snake[0]!;
    const next: Point = { ...head };
    if (this.dir === 'up') next.y -= 1;
    if (this.dir === 'down') next.y += 1;
    if (this.dir === 'left') next.x -= 1;
    if (this.dir === 'right') next.x += 1;

    if (next.x < 0 || next.y < 0 || next.x >= this.cols || next.y >= this.rows) {
      this.die();
      return;
    }
    if (this.snake.some(p => p.x === next.x && p.y === next.y)) {
      this.die();
      return;
    }

    this.snake.unshift(next);
    const ate = next.x === this.food.x && next.y === this.food.y;
    if (ate) {
      this.roundApples += 1;
      this.placeFood();
      this.draw();
      this.eating = true;
      try {
        await this.onEat();
      } finally {
        this.eating = false;
      }
    } else {
      this.snake.pop();
      this.draw();
    }
  }

  private die(): void {
    this.stop();
    this.draw();
    this.onDie();
  }

  draw(): void {
    const { ctx, cell } = this;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, this.rows * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= this.rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(this.cols * cell, y * cell + 0.5);
      ctx.stroke();
    }

    // food
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(
      this.food.x * cell + cell / 2,
      this.food.y * cell + cell / 2,
      cell * 0.35,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // snake
    this.snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#4ade80' : '#22c55e';
      const pad = 1;
      ctx.fillRect(p.x * cell + pad, p.y * cell + pad, cell - pad * 2, cell - pad * 2);
    });
  }
}
