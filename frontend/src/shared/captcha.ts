import { fetchCaptcha } from '../api/client';
import type { CaptchaChallenge } from '../types';

export interface CaptchaController {
  getValues: () => { captchaId: string; captchaAnswer: number };
  refresh: () => Promise<void>;
}

export function captchaFieldHtml(): string {
  return `
    <div class="slider-captcha" id="captcha-field">
      <div class="slider-captcha__header">
        <span>Сдвиньте фигурку, чтобы совпала</span>
        <button type="button" class="captcha-refresh" id="captcha-refresh" title="Обновить">↻</button>
      </div>
      <div class="slider-captcha__image" id="captcha-image">
        <img class="slider-captcha__bg" id="captcha-bg" alt="">
        <img class="slider-captcha__piece" id="captcha-piece" alt="">
      </div>
      <div class="slider-captcha__track-wrap">
        <div class="slider-captcha__track" id="captcha-track">
          <div class="slider-captcha__track-fill" id="captcha-track-fill"></div>
          <div class="slider-captcha__thumb" id="captcha-thumb">➜</div>
        </div>
        <input type="range" class="slider-captcha__range" id="captcha-range"
          min="0" max="256" value="0" aria-label="Сдвиньте ползунок">
      </div>
    </div>
  `;
}

export async function setupCaptcha(root: ParentNode): Promise<CaptchaController> {
  const imageEl = root.querySelector<HTMLElement>('#captcha-image')!;
  const bgEl = root.querySelector<HTMLImageElement>('#captcha-bg')!;
  const pieceEl = root.querySelector<HTMLImageElement>('#captcha-piece')!;
  const trackEl = root.querySelector<HTMLElement>('#captcha-track')!;
  const rangeEl = root.querySelector<HTMLInputElement>('#captcha-range')!;
  const thumbEl = root.querySelector<HTMLDivElement>('#captcha-thumb')!;
  const fillEl = root.querySelector<HTMLDivElement>('#captcha-track-fill')!;
  const refreshBtn = root.querySelector<HTMLButtonElement>('#captcha-refresh')!;

  let current: CaptchaChallenge | null = null;
  let maxSlide = 256;
  let logicalX = 0;

  const updateSlider = (value: number) => {
    const x = Math.max(0, Math.min(value, maxSlide));
    logicalX = x;
    rangeEl.value = String(x);

    const trackW = trackEl.clientWidth || 1;
    const thumbW = thumbEl.offsetWidth || 34;
    const thumbLeft = maxSlide > 0 ? (x / maxSlide) * Math.max(0, trackW - thumbW) : 0;
    thumbEl.style.left = `${thumbLeft}px`;
    fillEl.style.width = `${thumbLeft + thumbW / 2}px`;

    if (!current) {
      pieceEl.style.left = '0px';
      return;
    }
    const scale = (imageEl.clientWidth || current.trackWidth) / current.trackWidth;
    pieceEl.style.left = `${x * scale}px`;
    pieceEl.style.top = `${current.pieceY * scale}px`;
    pieceEl.style.width = `${current.pieceWidth * scale}px`;
    pieceEl.style.height = `${current.pieceWidth * scale}px`;
  };

  const applyChallenge = (ch: CaptchaChallenge) => {
    current = ch;
    maxSlide = Math.max(1, ch.trackWidth - ch.pieceWidth);
    rangeEl.max = String(maxSlide);
    bgEl.src = ch.background;
    pieceEl.src = ch.piece;
    updateSlider(0);
  };

  const refresh = async () => {
    const ch = await fetchCaptcha();
    applyChallenge(ch);
  };

  rangeEl.addEventListener('input', () => {
    updateSlider(Number(rangeEl.value));
  });

  // Пересчёт при смене ширины (ТВ / поворот / клавиатура).
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => updateSlider(logicalX))
    : null;
  ro?.observe(imageEl);
  ro?.observe(trackEl);

  refreshBtn.addEventListener('click', () => void refresh().catch(() => {
    bgEl.alt = 'Ошибка загрузки';
  }));

  await refresh();
  // После вставки в DOM ширина может стать известна чуть позже.
  requestAnimationFrame(() => updateSlider(logicalX));

  return {
    getValues: () => ({
      captchaId: current?.id ?? '',
      captchaAnswer: Math.round(logicalX),
    }),
    refresh,
  };
}
