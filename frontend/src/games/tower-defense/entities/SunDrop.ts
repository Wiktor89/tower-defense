export class SunDrop {
  x: number;
  y: number;
  amount: number;
  lifetime: number;
  age = 0;
  collected = false;
  targetY: number;
  startY: number;
  falling = true;

  constructor(x: number, y: number, amount: number, lifetime: number) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.lifetime = lifetime;
    this.targetY = y;
    this.startY = y - 60;
    this.y = this.startY;
  }

  update(dt: number): boolean {
    this.age += dt;
    if (this.falling) {
      this.y += 120 * dt / 1000;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.falling = false;
      }
    }
    return !this.collected && this.age < this.lifetime;
  }

  contains(px: number, py: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy < 900;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const pulse = 1 + Math.sin(this.age / 200) * 0.08;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pulse, pulse);
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.fillText('☀️', 0, 0);
    ctx.restore();
  }
}
