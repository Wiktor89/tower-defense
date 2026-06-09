import { CONFIG } from '../config.js';
import { Projectile } from './projectile.js';

export class Plant {
  constructor(type, col, row, cellW, cellH, gridX, gridY) {
    const cfg = CONFIG.PLANTS[type];
    this.type = type;
    this.col = col;
    this.row = row;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.cfg = cfg;
    this.alive = true;

    this.x = gridX + col * cellW + cellW / 2;
    this.y = gridY + row * cellH + cellH / 2;
    this.w = cellW;
    this.h = cellH;

    this.fireTimer = 0;
    this.sunTimer = cfg.sunInterval ? cfg.sunInterval * 0.5 : 0;
    this.fuseTimer = type === 'cherrybomb' ? cfg.fuseTime : 0;
    this.exploded = false;
  }

  update(dt, zombies, projectiles, onSun, onExplode) {
    if (!this.alive) return;

    if (this.type === 'cherrybomb') {
      this.fuseTimer -= dt;
      if (this.fuseTimer <= 0 && !this.exploded) {
        this.exploded = true;
        this.alive = false;
        onExplode(this.x, this.y, this.cfg.damage, this.cfg.radius);
      }
      return;
    }

    if (this.cfg.sunInterval) {
      this.sunTimer += dt;
      if (this.sunTimer >= this.cfg.sunInterval) {
        this.sunTimer = 0;
        onSun(this.x, this.y, this.cfg.sunAmount);
      }
    }

    if (this.cfg.fireRate) {
      const laneZombies = zombies.filter(z => z.alive && z.row === this.row && z.x > this.x);
      if (laneZombies.length > 0) {
        this.fireTimer += dt;
        if (this.fireTimer >= this.cfg.fireRate) {
          this.fireTimer = 0;
          projectiles.push(new Projectile(
            this.x + 20, this.y, this.row, this.cfg.damage, this.cfg.projectileSpeed
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

  draw(ctx) {
    if (!this.alive && !this.exploded) return;

    const shake = this.type === 'cherrybomb' ? Math.sin(Date.now() / 50) * 3 : 0;

    ctx.save();
    ctx.translate(this.x + shake, this.y);

    if (this.type === 'cherrybomb') {
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
