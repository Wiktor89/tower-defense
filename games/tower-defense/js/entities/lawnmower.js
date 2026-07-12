import { CONFIG } from '../config.js';

export class LawnMower {
  constructor(row) {
    const { GRID_X, GRID_Y, CELL_W, CELL_H, COLS } = CONFIG;
    this.row = row;
    this.state = 'idle'; // idle | running | gone
    this.x = GRID_X + CELL_W / 2;
    this.y = GRID_Y + row * CELL_H + CELL_H / 2;
    this.rightBound = GRID_X + COLS * CELL_W + 60;
    this.speed = CONFIG.LAWNMOWER.speed;
  }

  activate() {
    if (this.state !== 'idle') return false;
    this.state = 'running';
    return true;
  }

  update(dt, zombies) {
    if (this.state !== 'running') return;

    this.x += this.speed * dt / 1000;

    for (const zombie of zombies) {
      if (zombie.alive && zombie.row === this.row && zombie.x <= this.x + 35) {
        zombie.alive = false;
      }
    }

    if (this.x > this.rightBound) {
      this.state = 'gone';
    }
  }

  triggersFor(zombieX) {
    return zombieX <= CONFIG.GRID_X + CONFIG.CELL_W + 10;
  }

  draw(ctx) {
    if (this.state === 'gone') return;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.state === 'running') {
      ctx.translate(Math.sin(Date.now() / 40) * 1.5, 0);
    }

    // корпус
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(-22, -14, 44, 22);
    ctx.fillStyle = '#b71c1c';
    ctx.fillRect(-22, -14, 44, 6);

    // ручка
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -14);
    ctx.lineTo(-18, -26);
    ctx.lineTo(-8, -26);
    ctx.stroke();

    // колёса
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-12, 10, 7, 0, Math.PI * 2);
    ctx.arc(12, 10, 7, 0, Math.PI * 2);
    ctx.fill();

    // нож
    ctx.fillStyle = '#9e9e9e';
    ctx.fillRect(18, -4, 10, 4);

    ctx.restore();
  }
}
