import { CONFIG } from './config.js';
import { Plant } from './entities/plant.js';
import { Zombie } from './entities/zombie.js';
import { SunDrop } from './entities/sun.js';
import { LawnMower } from './entities/lawnmower.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.sun = CONFIG.START_SUN;
    this.lives = CONFIG.START_LIVES;
    this.wave = 0;
    this.state = 'playing'; // playing | won | lost
    this.paused = false;

    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.explosions = [];
    this.lawnmowers = [];

    this.selectedPlant = null;
    this.hoverCell = null;

    this.waveZombiesLeft = 0;
    this.waveSpawnTimer = 0;
    this.waveSpawnIndex = 0;
    this.wavePause = 0;
    this.pendingNextWave = false;
    this.sunFallTimer = 0;
    this.lastTime = 0;

    this.onStateChange = null;
  }

  reset() {
    this.sun = CONFIG.START_SUN;
    this.lives = CONFIG.START_LIVES;
    this.wave = 0;
    this.state = 'playing';
    this.paused = false;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.explosions = [];
    this.lawnmowers = Array.from({ length: CONFIG.ROWS }, (_, row) => new LawnMower(row));
    this.selectedPlant = null;
    this.waveZombiesLeft = 0;
    this.waveSpawnTimer = 0;
    this.waveSpawnIndex = 0;
    this.wavePause = 3000;
    this.pendingNextWave = false;
    this.sunFallTimer = 3000;
    this.beginWave();
    this._notify();
  }

  beginWave() {
    if (this.wave >= CONFIG.TOTAL_WAVES) return;
    const waveCfg = CONFIG.WAVES[this.wave];
    this.waveZombiesLeft = waveCfg.count;
    this.waveSpawnIndex = 0;
    this.waveSpawnTimer = 2000;
    this.wave++;
    this._notify();
  }

  cellAt(px, py) {
    const { GRID_X, GRID_Y, CELL_W, CELL_H, COLS, ROWS } = CONFIG;
    const col = Math.floor((px - GRID_X) / CELL_W);
    const row = Math.floor((py - GRID_Y) / CELL_H);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  canPlace(col, row) {
    if (col === CONFIG.LAWNMOWER.col) return false;
    return !this.plants.some(p => p.alive && p.col === col && p.row === row);
  }

  togglePause() {
    if (this.state !== 'playing') return false;
    this.paused = !this.paused;
    this._notify();
    return true;
  }

  selectPlant(type) {
    if (this.selectedPlant === type) {
      this.selectedPlant = null;
    } else {
      this.selectedPlant = type;
    }
  }

  placePlant(col, row) {
    if (!this.selectedPlant || this.state !== 'playing' || this.paused) return false;
    const cfg = CONFIG.PLANTS[this.selectedPlant];
    if (this.sun < cfg.cost || !this.canPlace(col, row)) return false;

    this.sun -= cfg.cost;
    this.plants.push(new Plant(
      this.selectedPlant, col, row,
      CONFIG.CELL_W, CONFIG.CELL_H, CONFIG.GRID_X, CONFIG.GRID_Y
    ));

    if (this.selectedPlant !== 'cherrybomb') {
      // cherry bomb stays selected only if affordable again
    }
    this.selectedPlant = null;
    this._notify();
    return true;
  }

  collectSun(x, y) {
    for (const sun of this.suns) {
      if (!sun.collected && sun.contains(x, y)) {
        sun.collected = true;
        this.sun += sun.amount;
        this._notify();
        return true;
      }
    }
    return false;
  }

  spawnSun(x, y, amount) {
    this.suns.push(new SunDrop(x, y, amount, CONFIG.SUN_LIFETIME));
  }

  spawnZombie() {
    const waveCfg = CONFIG.WAVES[this.wave - 1];
    const type = waveCfg.types[this.waveSpawnIndex % waveCfg.types.length];
    const row = Math.floor(Math.random() * CONFIG.ROWS);
    this.zombies.push(new Zombie(
      type, row, CONFIG.CELL_H, CONFIG.GRID_Y, CONFIG.GRID_X, CONFIG.COLS, CONFIG.CELL_W
    ));
    this.waveSpawnIndex++;
    this.waveZombiesLeft--;
  }

  explode(x, y, damage, radius) {
    this.explosions.push({ x, y, radius, age: 0, maxAge: 500 });
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const dx = z.x - x;
      const dy = z.y - y;
      if (dx * dx + dy * dy < radius * radius) {
        z.takeDamage(damage);
      }
    }
  }

  handleClick(x, y) {
    if (this.state !== 'playing' || this.paused) return;

    if (this.collectSun(x, y)) return;

    const cell = this.cellAt(x, y);
    if (cell && this.selectedPlant) {
      this.placePlant(cell.col, cell.row);
    }
  }

  handleMouseMove(x, y) {
    this.hoverCell = this.cellAt(x, y);
  }

  update(dt) {
    if (this.state !== 'playing' || this.paused) return;

    this.sunFallTimer -= dt;
    if (this.sunFallTimer <= 0) {
      this.sunFallTimer = CONFIG.SUN_FALL_INTERVAL;
      const x = CONFIG.GRID_X + Math.random() * CONFIG.COLS * CONFIG.CELL_W;
      this.spawnSun(x, 30, CONFIG.SUN_FALL_AMOUNT);
    }

    if (this.wavePause > 0) {
      this.wavePause -= dt;
      if (this.wavePause <= 0 && this.pendingNextWave) {
        this.pendingNextWave = false;
        this.beginWave();
      }
      if (this.wavePause > 0) {
        this.suns = this.suns.filter(s => s.update(dt));
        return;
      }
    }

    const waveCfg = this.wave > 0 ? CONFIG.WAVES[this.wave - 1] : null;
    if (waveCfg && this.waveZombiesLeft > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        this.spawnZombie();
        this.waveSpawnTimer = waveCfg.interval;
      }
    }

    const aliveZombies = this.zombies.filter(z => z.alive);
    if (waveCfg && this.waveZombiesLeft <= 0 && aliveZombies.length === 0 && !this.pendingNextWave) {
      if (this.wave >= CONFIG.TOTAL_WAVES) {
        this.state = 'won';
        this._notify();
      } else {
        this.wavePause = 5000;
        this.pendingNextWave = true;
      }
    }

    for (const plant of this.plants) {
      plant.update(dt, this.zombies, this.projectiles,
        (x, y, amt) => this.spawnSun(x, y - 20, amt),
        (x, y, dmg, r) => this.explode(x, y, dmg, r)
      );
    }

    for (const zombie of this.zombies) {
      zombie.update(dt, this.plants);
    }

    for (const zombie of this.zombies) {
      if (!zombie.alive) continue;
      const mower = this.lawnmowers[zombie.row];
      if (mower.state === 'idle' && mower.triggersFor(zombie.x)) {
        mower.activate();
        zombie.alive = false;
      }
    }

    for (const mower of this.lawnmowers) {
      mower.update(dt, this.zombies);
    }

    for (const zombie of this.zombies) {
      if (!zombie.alive) continue;
      if (zombie.reachedHouse()) {
        zombie.alive = false;
        this.lives--;
        this._notify();
        if (this.lives <= 0) {
          this.state = 'lost';
          this._notify();
        }
      }
    }

    for (const proj of this.projectiles) {
      proj.update(dt);
      if (!proj.active) continue;
      for (const zombie of this.zombies) {
        if (!zombie.alive || zombie.row !== proj.row) continue;
        if (Math.abs(zombie.x - proj.x) < 25) {
          zombie.takeDamage(proj.damage);
          proj.active = false;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.active);

    this.suns = this.suns.filter(s => s.update(dt));
    this.plants = this.plants.filter(p => p.alive);
    this.explosions = this.explosions.filter(e => {
      e.age += dt;
      return e.age < e.maxAge;
    });
  }

  _notify() {
    if (this.onStateChange) this.onStateChange(this);
  }

  draw() {
    const ctx = this.ctx;
    const { GRID_X, GRID_Y, CELL_W, CELL_H, COLS, ROWS } = CONFIG;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let row = 0; row < ROWS; row++) {
      const shade = row % 2 === 0 ? '#5d8a3c' : '#4a7c32';
      ctx.fillStyle = shade;
      ctx.fillRect(GRID_X, GRID_Y + row * CELL_H, COLS * CELL_W, CELL_H);

      // клетка газонокосилки
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(GRID_X, GRID_Y + row * CELL_H, CELL_W, CELL_H);

      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let col = 0; col < COLS; col++) {
        ctx.strokeRect(GRID_X + col * CELL_W, GRID_Y + row * CELL_H, CELL_W, CELL_H);
      }
    }

    ctx.fillStyle = '#3e2723';
    ctx.fillRect(GRID_X - 50, GRID_Y, 48, ROWS * CELL_H);
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏠', GRID_X - 26, GRID_Y + (ROWS * CELL_H) / 2);

    if (this.hoverCell && this.selectedPlant) {
      const { col, row } = this.hoverCell;
      const canPlace = this.canPlace(col, row);
      ctx.fillStyle = canPlace ? 'rgba(255,255,255,0.2)' : 'rgba(255,0,0,0.2)';
      ctx.fillRect(GRID_X + col * CELL_W, GRID_Y + row * CELL_H, CELL_W, CELL_H);
      if (canPlace) {
        ctx.font = '36px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.5;
        ctx.fillText(CONFIG.PLANTS[this.selectedPlant].icon,
          GRID_X + col * CELL_W + CELL_W / 2,
          GRID_Y + row * CELL_H + CELL_H / 2);
        ctx.globalAlpha = 1;
      }
    }

    for (const mower of this.lawnmowers) mower.draw(ctx);
    for (const plant of this.plants) plant.draw(ctx);
    for (const zombie of this.zombies) zombie.draw(ctx);
    for (const proj of this.projectiles) proj.draw(ctx);
    for (const sun of this.suns) sun.draw(ctx);

    for (const exp of this.explosions) {
      const t = exp.age / exp.maxAge;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * (0.5 + t * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 100, 0, ${1 - t})`;
      ctx.fill();
    }

    if (this.wavePause > 0 && this.state === 'playing' && !this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Волна ${this.wave} через ${Math.ceil(this.wavePause / 1000)}...`,
        this.canvas.width / 2, this.canvas.height / 2);
    }

    if (this.paused && this.state === 'playing') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏸ Пауза', this.canvas.width / 2, this.canvas.height / 2 - 20);
      ctx.font = '18px sans-serif';
      ctx.fillText('Нажмите Пробел или кнопку «Продолжить»',
        this.canvas.width / 2, this.canvas.height / 2 + 24);
    }
  }

  loop(timestamp) {
    if (this.paused) {
      this.lastTime = timestamp;
      this.draw();
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    const dt = Math.min(timestamp - this.lastTime, 50);
    this.lastTime = timestamp;
    if (dt > 0) this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.lastTime = performance.now();
    this.reset();
    requestAnimationFrame((t) => this.loop(t));
  }
}
