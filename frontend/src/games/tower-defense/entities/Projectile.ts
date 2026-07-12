export class Projectile {
  x: number;
  y: number;
  row: number;
  damage: number;
  speed: number;
  active = true;
  radius = 8;

  constructor(x: number, y: number, row: number, damage: number, speed: number) {
    this.x = x;
    this.y = y;
    this.row = row;
    this.damage = damage;
    this.speed = speed;
  }

  update(dt: number): void {
    this.x += this.speed * dt / 1000;
    if (this.x > 950) this.active = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#66bb6a';
    ctx.fill();
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
