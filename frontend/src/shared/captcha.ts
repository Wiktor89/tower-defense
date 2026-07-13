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
        <div class="slider-captcha__track">
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
  const bgEl = root.querySelector<HTMLImageElement>('#captcha-bg')!;
  const pieceEl = root.querySelector<HTMLImageElement>('#captcha-piece')!;
  const rangeEl = root.querySelector<HTMLInputElement>('#captcha-range')!;
  const thumbEl = root.querySelector<HTMLDivElement>('#captcha-thumb')!;
  const fillEl = root.querySelector<HTMLDivElement>('#captcha-track-fill')!;
  const refreshBtn = root.querySelector<HTMLButtonElement>('#captcha-refresh')!;

  let current: CaptchaChallenge | null = null;
  let maxSlide = 256;

  const updateSlider = (value: number) => {
    const x = Math.max(0, Math.min(value, maxSlide));
    rangeEl.value = String(x);
    pieceEl.style.left = `${x}px`;
    thumbEl.style.left = `${x}px`;
    fillEl.style.width = `${x + 20}px`;
  };

  const applyChallenge = (ch: CaptchaChallenge) => {
    current = ch;
    maxSlide = ch.trackWidth - ch.pieceWidth;
    rangeEl.max = String(maxSlide);
    bgEl.src = ch.background;
    pieceEl.src = ch.piece;
    pieceEl.style.top = `${ch.pieceY}px`;
    pieceEl.style.width = `${ch.pieceWidth}px`;
    pieceEl.style.height = `${ch.pieceWidth}px`;
    updateSlider(0);
  };

  const refresh = async () => {
    const ch = await fetchCaptcha();
    applyChallenge(ch);
  };

  rangeEl.addEventListener('input', () => {
    updateSlider(Number(rangeEl.value));
  });

  refreshBtn.addEventListener('click', () => void refresh().catch(() => {
    bgEl.alt = 'Ошибка загрузки';
  }));

  await refresh();

  return {
    getValues: () => ({
      captchaId: current?.id ?? '',
      captchaAnswer: Math.round(Number(rangeEl.value)),
    }),
    refresh,
  };
}
