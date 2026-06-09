export class Projectile {
  constructor(x, y, row, damage, speed) {
    this.x = x;
    this.y = y;
    this.row = row;
    this.damage = damage;
    this.speed = speed;
    this.active = true;
    this.radius = 8;
  }

  update(dt) {
    this.x += this.speed * dt / 1000;
    if (this.x > 950) this.active = false;
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#66bb6a';
    ctx.fill();
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
