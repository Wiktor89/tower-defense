import './style.css';
import '../../shared/tv-controls.css';
import { checkFillBlanks, fetchFillBlanksPuzzle, fetchFillBlanksSession } from '../../api/client';
import { showChallengeReward } from '../../shared/solar-reward';
import type { FillBlanksParagraph, FillBlanksPuzzle, FillBlanksToken } from '../../types';
import { ensureUserLogin } from '../../shared/login';
import { getUser } from '../../shared/user';

document.body.classList.add('tv-ready');

const paragraphsEl = document.getElementById('paragraphs');
const feedbackEl = document.getElementById('feedback');
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement | null;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement | null;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
const scoreCorrectEl = document.getElementById('score-correct');
const scoreWrongEl = document.getElementById('score-wrong');

if (!paragraphsEl || !feedbackEl || !checkBtn || !clearBtn || !nextBtn || !scoreCorrectEl || !scoreWrongEl) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  paragraphsEl,
  feedbackEl,
  checkBtn,
  clearBtn,
  nextBtn,
  scoreCorrectEl,
  scoreWrongEl,
};

let puzzle: FillBlanksPuzzle | null = null;
let fills: (string | null)[] = [];
let locked = false;
let correctCount = 0;
let wrongCount = 0;
let dragWord: string | null = null;
let dragFromBlank: number | null = null;
let dragPara: number | null = null;

function showFeedback(text: string, type: 'correct' | 'wrong' | 'hint'): void {
  ui.feedbackEl.textContent = text;
  ui.feedbackEl.className = `feedback ${type}`;
}

function hideFeedback(): void {
  ui.feedbackEl.className = 'feedback hidden';
}

function updateScore(): void {
  ui.scoreCorrectEl.textContent = `✓ ${correctCount}`;
  ui.scoreWrongEl.textContent = `✗ ${wrongCount}`;
}

function allFilled(): boolean {
  return !!puzzle && fills.length > 0 && fills.every(Boolean);
}

function updateCheckVisibility(): void {
  ui.checkBtn.classList.toggle('hidden', !(!locked && allFilled()));
}

function blankIndexes(para: FillBlanksParagraph): number[] {
  return para.tokens.filter(t => t.type === 'blank').map(t => t.index ?? 0);
}

function usedInParagraph(para: FillBlanksParagraph): Map<string, number> {
  const counts = new Map<string, number>();
  for (const idx of blankIndexes(para)) {
    const w = fills[idx];
    if (!w) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
}

function bankAvailability(para: FillBlanksParagraph): Map<string, number> {
  const available = new Map<string, number>();
  for (const w of para.words) {
    available.set(w, (available.get(w) ?? 0) + 1);
  }
  for (const [w, n] of usedInParagraph(para)) {
    available.set(w, (available.get(w) ?? 0) - n);
  }
  return available;
}

function placeWord(blankIndex: number, word: string, paraIndex: number): void {
  if (!puzzle || locked) return;
  const para = puzzle.paragraphs[paraIndex];
  if (!para) return;
  if (!blankIndexes(para).includes(blankIndex)) return;

  if (dragFromBlank !== null && dragFromBlank !== blankIndex) {
    fills[dragFromBlank] = null;
  }
  fills[blankIndex] = word;
  dragWord = null;
  dragFromBlank = null;
  dragPara = null;
  hideFeedback();
  render();
}

function clearBlank(blankIndex: number): void {
  if (locked) return;
  fills[blankIndex] = null;
  render();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function renderTokens(tokens: FillBlanksToken[], paraIndex: number): string {
  return tokens.map(token => {
    if (token.type === 'text') {
      return `<span class="text-chunk">${escapeHtml(token.value ?? '')}</span>`;
    }
    const idx = token.index ?? 0;
    const value = fills[idx];
    const classes = ['blank'];
    if (value) classes.push('filled');
    const label = value ? escapeHtml(value) : '····';
    return `<span class="${classes.join(' ')}" data-blank="${idx}" data-para="${paraIndex}" ${locked ? '' : 'tabindex="0"'}>${label}</span>`;
  }).join('');
}

function renderBank(para: FillBlanksParagraph, paraIndex: number): string {
  if (para.blankCount === 0 || para.words.length === 0) {
    return '<p class="bank-empty">Нет пропусков</p>';
  }
  const available = bankAvailability(para);
  const rendered = new Set<string>();
  const chips: string[] = [];
  for (const word of para.words) {
    if (rendered.has(word)) continue;
    rendered.add(word);
    const left = available.get(word) ?? 0;
    const classes = ['word-chip'];
    if (left <= 0) classes.push('used');
    chips.push(
      `<button type="button" class="${classes.join(' ')}" data-word="${escapeAttr(word)}" data-para="${paraIndex}"
        draggable="${!locked && left > 0}" ${locked || left <= 0 ? 'disabled' : ''}>${escapeHtml(word)}</button>`,
    );
  }
  return chips.join('');
}

function bindParagraphEvents(row: HTMLElement, paraIndex: number): void {
  row.querySelectorAll<HTMLElement>('.blank').forEach(el => {
    const idx = Number(el.dataset.blank);

    el.addEventListener('dragover', (e) => {
      if (locked) return;
      if (dragPara !== null && dragPara !== paraIndex) return;
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (locked) return;
      const fromPara = Number((e.dataTransfer?.getData('application/x-para') || String(dragPara ?? -1)));
      if (fromPara !== paraIndex) return;
      const word = e.dataTransfer?.getData('text/plain') || dragWord;
      if (!word) return;
      placeWord(idx, word, paraIndex);
    });

    if (fills[idx] && !locked) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        const word = fills[idx];
        if (!word) return;
        dragWord = word;
        dragFromBlank = idx;
        dragPara = paraIndex;
        e.dataTransfer?.setData('text/plain', word);
        e.dataTransfer?.setData('application/x-para', String(paraIndex));
        e.dataTransfer!.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        dragWord = null;
        dragFromBlank = null;
        dragPara = null;
      });
      el.addEventListener('dblclick', () => clearBlank(idx));
    }
  });

  const bank = row.querySelector<HTMLElement>('.word-bank');
  if (!bank) return;

  bank.querySelectorAll<HTMLButtonElement>('.word-chip:not(.used)').forEach(btn => {
    const word = btn.dataset.word!;
    btn.addEventListener('dragstart', (e) => {
      dragWord = word;
      dragFromBlank = null;
      dragPara = paraIndex;
      e.dataTransfer?.setData('text/plain', word);
      e.dataTransfer?.setData('application/x-para', String(paraIndex));
      e.dataTransfer!.effectAllowed = 'move';
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      dragWord = null;
      dragFromBlank = null;
      dragPara = null;
    });
  });

  bank.addEventListener('dragover', (e) => {
    if (locked || dragPara !== paraIndex) return;
    e.preventDefault();
  });
  bank.addEventListener('drop', (e) => {
    e.preventDefault();
    if (locked || !puzzle || dragPara !== paraIndex) return;
    const word = e.dataTransfer?.getData('text/plain') || dragWord;
    if (!word) return;
    const idx = blankIndexes(puzzle.paragraphs[paraIndex]!).find(i => fills[i] === word);
    if (idx !== undefined) clearBlank(idx);
  });
}

function render(): void {
  if (!puzzle) {
    ui.paragraphsEl.innerHTML = '';
    updateCheckVisibility();
    return;
  }

  ui.paragraphsEl.innerHTML = puzzle.paragraphs.map((para, i) => `
    <section class="para-row" data-para="${i}">
      <div class="para-text sentence">${renderTokens(para.tokens, i)}</div>
      <aside class="bank-section">
        <h2 class="bank-title">Слова</h2>
        <div class="word-bank">${renderBank(para, i)}</div>
      </aside>
    </section>
  `).join('');

  ui.paragraphsEl.querySelectorAll<HTMLElement>('.para-row').forEach(row => {
    bindParagraphEvents(row, Number(row.dataset.para));
  });

  if (locked) {
    ui.paragraphsEl.querySelectorAll<HTMLElement>('.blank').forEach(el => {
      const idx = Number(el.dataset.blank);
      // styling applied after check separately
      void idx;
    });
  }

  updateCheckVisibility();
}

async function loadPuzzle(): Promise<void> {
  locked = false;
  dragWord = null;
  dragFromBlank = null;
  dragPara = null;
  hideFeedback();
  ui.nextBtn.classList.add('hidden');
  ui.clearBtn.classList.remove('hidden');
  ui.clearBtn.textContent = 'Очистить';
  ui.checkBtn.classList.add('hidden');

  try {
    puzzle = await fetchFillBlanksPuzzle();
    fills = Array.from({ length: puzzle.blankCount }, () => null);
    render();
  } catch (err) {
    puzzle = null;
    fills = [];
    ui.paragraphsEl.innerHTML = '';
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки';
    showFeedback(
      msg.toLowerCase().includes('no texts') || msg.toLowerCase().includes('not found')
        ? 'Администратор ещё не добавил тексты для этой игры.'
        : msg,
      'wrong',
    );
  }
}

async function onCheck(): Promise<void> {
  if (!puzzle || locked || !allFilled()) return;

  locked = true;
  updateCheckVisibility();
  const user = getUser();
  const answers = fills.map(v => v!);

  try {
    const result = await checkFillBlanks(puzzle.id, answers, user?.id);
    ui.paragraphsEl.querySelectorAll<HTMLElement>('.blank').forEach(el => {
      el.classList.add(result.correct ? 'correct' : 'wrong');
      el.draggable = false;
    });
    ui.paragraphsEl.querySelectorAll<HTMLButtonElement>('.word-chip').forEach(btn => {
      btn.disabled = true;
      btn.draggable = false;
    });

    if (result.correct) {
      correctCount++;
      updateScore();
      showFeedback(
        result.sessionComplete ? 'Серия завершена! Текст совпал.' : 'Верно! Текст совпал.',
        'correct',
      );
      ui.nextBtn.classList.remove('hidden');
      ui.clearBtn.classList.add('hidden');
      ui.checkBtn.classList.add('hidden');
      if (result.challengeReward) showChallengeReward(result.challengeReward);
    } else {
      wrongCount++;
      updateScore();
      showFeedback('Неверно. Попробуйте снова.', 'wrong');
      ui.clearBtn.textContent = 'Ещё раз';
      ui.clearBtn.classList.remove('hidden');
      ui.nextBtn.classList.remove('hidden');
      ui.checkBtn.classList.add('hidden');
    }
  } catch {
    locked = false;
    showFeedback('Ошибка проверки ответа', 'wrong');
    updateCheckVisibility();
  }
}

function onClear(): void {
  if (ui.clearBtn.textContent === 'Ещё раз') {
    void loadPuzzle();
    return;
  }
  if (locked || !puzzle) return;
  fills = fills.map(() => null);
  hideFeedback();
  render();
}

ui.checkBtn.addEventListener('click', () => void onCheck());
ui.clearBtn.addEventListener('click', onClear);
ui.nextBtn.addEventListener('click', () => void loadPuzzle());

updateScore();
void ensureUserLogin().then(async (user) => {
  try {
    const session = await fetchFillBlanksSession(user.id);
    correctCount = session.correct;
    wrongCount = session.wrong;
    updateScore();
  } catch {
    /* keep zeros */
  }
  await loadPuzzle();
});
