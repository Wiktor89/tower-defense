import { CONFIG } from '../config.js';

export class Zombie {
  constructor(type, row, cellH, gridY, gridX, cols, cellW) {
    const cfg = CONFIG.ZOMBIES[type];
    this.type = type;
    this.row = row;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.cfg = cfg;
    this.alive = true;
    this.eating = null;

    const rightEdge = gridX + cols * cellW + 40;
    this.x = rightEdge;
    this.y = gridY + row * cellH + cellH / 2;
    this.leftBound = gridX - 20;
  }

  update(dt, plants) {
    if (!this.alive) return;

    const colPlants = plants.filter(p => p.alive && p.row === this.row);
    const blocker = colPlants
      .filter(p => p.x < this.x + 20 && p.x > this.x - 40)
      .sort((a, b) => a.x - b.x)[0];

    if (blocker) {
      this.eating = blocker;
      return;
    }

    this.eating = null;
    this.x -= this.cfg.speed * dt / 1000;
  }

  reachedHouse() {
    return this.alive && this.x < this.leftBound;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
  }

  draw(ctx) {
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
