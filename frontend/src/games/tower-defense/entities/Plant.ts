import { CONFIG, type PlantConfig } from '../config';
import { Projectile } from './Projectile';
import type { Zombie } from './Zombie';

export class Plant {
  type: import('../../../types').PlantType;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  cfg: PlantConfig;
  alive = true;
  x: number;
  y: number;
  w: number;
  h: number;
  fireTimer = 0;
  sunTimer: number;
  fuseTimer: number;
  exploded = false;

  constructor(type: import('../../../types').PlantType, col: number, row: number) {
    const cfg: PlantConfig = CONFIG.PLANTS[type];
    const { CELL_W, CELL_H, GRID_X, GRID_Y } = CONFIG;

    this.type = type;
    this.col = col;
    this.row = row;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.cfg = cfg;

    this.x = GRID_X + col * CELL_W + CELL_W / 2;
    this.y = GRID_Y + row * CELL_H + CELL_H / 2;
    this.w = CELL_W;
    this.h = CELL_H;

    this.sunTimer = cfg.sunInterval ? cfg.sunInterval * 0.5 : 0;
    this.fuseTimer = type === 'cherrybomb' ? (cfg.fuseTime ?? 0) : 0;
  }

  update(
    dt: number,
    zombies: Zombie[],
    projectiles: Projectile[],
    onSun: (x: number, y: number, amt: number) => void,
    onExplode: (x: number, y: number, dmg: number, r: number) => void,
  ): void {
    if (!this.alive) return;

    if (this.type === 'cherrybomb') {
      this.fuseTimer -= dt;
      if (this.fuseTimer <= 0 && !this.exploded) {
        this.exploded = true;
        this.alive = false;
        onExplode(this.x, this.y, this.cfg.damage ?? 0, this.cfg.radius ?? 0);
      }
      return;
    }

    if (this.cfg.sunInterval) {
      this.sunTimer += dt;
      if (this.sunTimer >= this.cfg.sunInterval) {
        this.sunTimer = 0;
        onSun(this.x, this.y, this.cfg.sunAmount ?? 0);
      }
    }

    if (this.cfg.fireRate) {
      const laneZombies = zombies.filter(z => z.alive && z.row === this.row && z.x > this.x);
      if (laneZombies.length > 0) {
        this.fireTimer += dt;
        if (this.fireTimer >= this.cfg.fireRate) {
          this.fireTimer = 0;
          projectiles.push(new Projectile(
            this.x + 20, this.y, this.row, this.cfg.damage ?? 0, this.cfg.projectileSpeed ?? 0,
          ));
        }
      }
    }

    const eating = zombies.find(z => z.alive && z.row === this.row && z.eating === this);
    if (eating) {
      this.hp -= eating.cfg.damage * dt / eating.cfg.eatRate;
      if (this.hp <= 0) this.alive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive && !this.exploded) return;

    const shake = this.type === 'cherrybomb' ? Math.sin(Date.now() / 50) * 3 : 0;

    ctx.save();
    ctx.translate(this.x + shake, this.y);

    if (this.type === 'cherrybomb' && this.cfg.fuseTime) {
      const progress = 1 - this.fuseTimer / this.cfg.fuseTime;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + progress * 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(229, 57, 53, ${0.3 + progress * 0.4})`;
      ctx.fill();
    }

    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.cfg.icon, 0, 0);

    if (this.maxHp > 100) {
      const ratio = this.hp / this.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-30, 28, 60, 6);
      ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(-30, 28, 60 * ratio, 6);
    }

    ctx.restore();
  }
}
