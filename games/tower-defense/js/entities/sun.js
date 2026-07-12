export class SunDrop {
  constructor(x, y, amount, lifetime) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.lifetime = lifetime;
    this.age = 0;
    this.collected = false;
    this.targetY = y;
    this.startY = y - 60;
    this.y = this.startY;
    this.falling = true;
  }

  update(dt) {
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

  contains(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy < 900;
  }

  draw(ctx) {
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
