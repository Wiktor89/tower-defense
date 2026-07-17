/** Вертикальная запись дроби: числитель / черта / знаменатель. */

export function fracInputsHtml(numId: string, denId: string): string {
  return `
    <div class="frac-inputs" role="group" aria-label="Дробь">
      <input id="${numId}" type="number" step="1" inputmode="numeric" aria-label="Числитель">
      <span class="frac-bar" aria-hidden="true"></span>
      <input id="${denId}" type="number" min="1" step="1" inputmode="numeric" aria-label="Знаменатель">
    </div>
  `;
}

export function fracDisplayHtml(num: number | string, den: number | string, extraClass = ''): string {
  const cls = ['frac-display', extraClass].filter(Boolean).join(' ');
  return `
    <span class="${cls}" aria-label="${num} из ${den}">
      <span class="frac-num">${num}</span>
      <span class="frac-bar" aria-hidden="true"></span>
      <span class="frac-den">${den}</span>
    </span>
  `;
}
