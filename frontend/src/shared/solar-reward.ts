import './solar-reward.css';
import type { StageCompletion } from '../types';
import { PLANETS } from './planets';

export function showChallengeReward(completion: StageCompletion, onClose?: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'solar-overlay';

  const planetAngles = PLANETS.map((_, i) => (i / PLANETS.length) * 360);

  const planetsHtml = PLANETS.map((p, i) => {
    const angle = planetAngles[i]! * Math.PI / 180;
    const x = 50 + Math.cos(angle) * (p.orbit / 4.5);
    const y = 50 + Math.sin(angle) * (p.orbit / 4.5);
    const isTarget = p.id === completion.planet;
    const codeLabel = isTarget
      ? `<span class="solar-planet__code">${completion.code}</span>`
      : '';

    return `
      <div class="solar-planet${isTarget ? ' solar-planet--active' : ''}"
           style="left:${x}%;top:${y}%;width:${p.size}px;height:${p.size}px;background:${p.color}"
           title="${p.name}">
        ${p.id === 'saturn' ? '<span class="solar-ring"></span>' : ''}
        ${codeLabel}
        <span class="solar-planet__name">${p.name}</span>
      </div>
    `;
  }).join('');

  const orbitsHtml = PLANETS.map(p =>
    `<div class="solar-orbit" style="width:${p.orbit * 2}px;height:${p.orbit * 2}px"></div>`
  ).join('');

  const penaltyHtml = completion.penaltyNote
    ? `<p class="solar-penalty">${completion.penaltyNote}</p>`
    : '';
  const rewardLabel = completion.baseRewardRub && completion.baseRewardRub !== completion.rewardRub
    ? `Вы заработали <strong>${completion.rewardRub}₽</strong> <span class="solar-reward__base">(из ${completion.baseRewardRub}₽)</span>`
    : `Вы заработали <strong>${completion.rewardRub}₽</strong>`;

  overlay.innerHTML = `
    <div class="solar-modal">
      <h2 class="solar-title">🎉 Вызов дня пройден!</h2>
      <p class="solar-reward">${rewardLabel}</p>
      ${penaltyHtml}
      <p class="solar-hint">Запомните планету и цифру — администратор проверит их</p>
      <div class="solar-system">
        ${orbitsHtml}
        <div class="solar-sun">☀️</div>
        ${planetsHtml}
      </div>
      <button class="solar-close" id="solar-close">Продолжить</button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#solar-close')?.addEventListener('click', () => {
    overlay.remove();
    onClose?.();
  });
}
