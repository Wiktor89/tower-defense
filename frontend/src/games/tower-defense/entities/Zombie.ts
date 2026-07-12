import type { ZombieType } from '../../../types';
import { CONFIG, type ZombieConfig } from '../config';
import type { Plant } from './Plant';

export interface BlockerPlant {
  alive: boolean;
  row: number;
  x: number;
}

export class Zombie {
  type: ZombieType;
  row: number;
  hp: number;
  maxHp: number;
  cfg: ZombieConfig;
  alive = true;
  eating: Plant | null = null;
  x: number;
  y: number;
  leftBound: number;

  constructor(type: ZombieType, row: number) {
    const cfg = CONFIG.ZOMBIES[type];
    this.type = type;
    this.row = row;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.cfg = cfg;

    const { GRID_X, GRID_Y, CELL_H, COLS, CELL_W } = CONFIG;
    const rightEdge = GRID_X + COLS * CELL_W + 40;
    this.x = rightEdge;
    this.y = GRID_Y + row * CELL_H + CELL_H / 2;
    this.leftBound = GRID_X - 20;
  }

  update(dt: number, plants: BlockerPlant[]): void {
    if (!this.alive) return;

    const colPlants = plants.filter(p => p.alive && p.row === this.row);
    const blocker = colPlants
      .filter(p => p.x < this.x + 20 && p.x > this.x - 40)
      .sort((a, b) => a.x - b.x)[0];

    if (blocker) {
      this.eating = blocker as Plant;
      return;
    }

    this.eating = null;
    this.x -= this.cfg.speed * dt / 1000;
  }

  reachedHouse(): boolean {
    return this.alive && this.x < this.leftBound;
  }

  takeDamage(amount: number): void {
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;

    const bob = Math.sin(Date.now() / 300 + this.row) * 2;

    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.cfg.icon, 0, 0);

    const ratio = this.hp / this.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-25, -30, 50, 5);
    ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(-25, -30, 50 * ratio, 5);

    ctx.restore();
  }
}
