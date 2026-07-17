/** Вертикальная запись дроби: числитель сверху, черта, знаменатель снизу. */

export function fracInputsHtml(numId: string, denId: string): string {
  return `
    <div class="frac-inputs" role="group" aria-label="Дробь">
      <input id="${numId}" type="number" step="1" inputmode="numeric" aria-label="Числитель сверху">
      <span class="frac-bar" aria-hidden="true"></span>
      <input id="${denId}" type="number" min="1" step="1" inputmode="numeric" aria-label="Знаменатель снизу">
    </div>
  `;
}

export function fracDisplayHtml(num: number | string, den: number | string, extraClass = ''): string {
  const cls = ['frac-display', extraClass].filter(Boolean).join(' ');
  return `
    <span class="${cls}" aria-label="${num} сверху, ${den} снизу">
      <span class="frac-num">${num}</span>
      <span class="frac-bar" aria-hidden="true"></span>
      <span class="frac-den">${den}</span>
    </span>
  `;
}

/** Вставляет вертикальные дроби в текст: маркеры вида {{1|4}}. */
export function withFracMarks(text: string): string {
  return text.replace(/\{\{([^|}]+)\|([^}]+)\}\}/g, (_m, num: string, den: string) =>
    fracDisplayHtml(num.trim(), den.trim(), 'frac-display--inline'),
  );
}
