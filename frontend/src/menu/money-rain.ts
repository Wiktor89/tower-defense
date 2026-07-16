const EXTREME_X = 8;
const BURST_COUNT = 5;
const COIN_SIZE = 14;
const BILL_W = 18;
const BILL_H = 10;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickType(): 'coin' | 'bill' {
  return Math.random() < 0.55 ? 'coin' : 'bill';
}

function createParticle(layer: HTMLElement, originX: number, originY: number, side: -1 | 1): void {
  const el = document.createElement('span');
  const kind = pickType();
  el.className = kind === 'coin' ? 'money-rain__coin' : 'money-rain__bill';
  el.setAttribute('aria-hidden', 'true');

  const drift = side * rand(8, 36) + rand(-10, 10);
  const fall = rand(90, 160);
  const spin = rand(-420, 420);
  const delay = rand(0, 120);
  const duration = rand(700, 1100);

  el.style.left = `${originX}px`;
  el.style.top = `${originY}px`;
  if (kind === 'coin') {
    el.style.width = `${COIN_SIZE}px`;
    el.style.height = `${COIN_SIZE}px`;
  } else {
    el.style.width = `${BILL_W}px`;
    el.style.height = `${BILL_H}px`;
  }
  el.style.setProperty('--mx', `${drift}px`);
  el.style.setProperty('--my', `${fall}px`);
  el.style.setProperty('--spin', `${spin}deg`);
  el.style.animationDuration = `${duration}ms`;
  el.style.animationDelay = `${delay}ms`;

  layer.appendChild(el);
  window.setTimeout(() => el.remove(), duration + delay + 40);
}

function burst(layer: HTMLElement, logo: HTMLElement, side: -1 | 1): void {
  const logoRect = logo.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();
  const originX = logoRect.left + logoRect.width / 2 - layerRect.left + side * (logoRect.width * 0.35);
  const originY = logoRect.top + logoRect.height * 0.45 - layerRect.top;
  for (let i = 0; i < BURST_COUNT; i++) {
    createParticle(layer, originX, originY, side);
  }
}

function readTranslateX(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  return new DOMMatrixReadOnly(t).m41;
}

export function startMoneyRain(logo: HTMLElement, layer: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let lastSide: -1 | 0 | 1 = 0;
  let armed = true;

  const tick = (): void => {
    const x = readTranslateX(logo);
    if (Math.abs(x) >= EXTREME_X) {
      const side: -1 | 1 = x < 0 ? -1 : 1;
      if (armed && side !== lastSide) {
        burst(layer, logo, side);
        lastSide = side;
        armed = false;
      }
    } else if (Math.abs(x) < 3) {
      armed = true;
      lastSide = 0;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
