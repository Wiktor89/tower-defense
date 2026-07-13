import './style.css';
import { checkFillBlanks, fetchFillBlanksPuzzle } from '../../api/client';
import type { FillBlanksPuzzle } from '../../types';
import { ensureUserLogin } from '../../shared/login';
import { getUser } from '../../shared/user';

const sentenceEl = document.getElementById('sentence');
const bankEl = document.getElementById('word-bank');
const feedbackEl = document.getElementById('feedback');
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement | null;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement | null;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
const scoreCorrectEl = document.getElementById('score-correct');
const scoreWrongEl = document.getElementById('score-wrong');

if (
  !sentenceEl || !bankEl || !feedbackEl || !checkBtn || !clearBtn || !nextBtn ||
  !scoreCorrectEl || !scoreWrongEl
) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  sentenceEl,
  bankEl,
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
  const show = !locked && allFilled();
  ui.checkBtn.classList.toggle('hidden', !show);
}

function usedWords(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of fills) {
    if (!w) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
}

function bankAvailability(): Map<string, number> {
  const available = new Map<string, number>();
  if (!puzzle) return available;
  for (const w of puzzle.words) {
    available.set(w, (available.get(w) ?? 0) + 1);
  }
  const used = usedWords();
  for (const [w, n] of used) {
    available.set(w, (available.get(w) ?? 0) - n);
  }
  return available;
}

function placeWord(blankIndex: number, word: string): void {
  if (!puzzle || locked) return;
  if (dragFromBlank !== null && dragFromBlank !== blankIndex) {
    fills[dragFromBlank] = null;
  }
  fills[blankIndex] = word;
  dragWord = null;
  dragFromBlank = null;
  hideFeedback();
  render();
}

function clearBlank(blankIndex: number): void {
  if (locked) return;
  fills[blankIndex] = null;
  render();
}

function renderSentence(): void {
  if (!puzzle) {
    ui.sentenceEl.innerHTML = '';
    return;
  }

  ui.sentenceEl.innerHTML = puzzle.tokens.map(token => {
    if (token.type === 'text') {
      return `<span class="text-chunk">${escapeHtml(token.value ?? '')}</span>`;
    }
    const idx = token.index ?? 0;
    const value = fills[idx];
    const classes = ['blank'];
    if (value) classes.push('filled');
    const label = value ? escapeHtml(value) : '····';
    return `<span class="${classes.join(' ')}" data-blank="${idx}" ${locked ? '' : 'tabindex="0"'}>${label}</span>`;
  }).join('');

  ui.sentenceEl.querySelectorAll<HTMLElement>('.blank').forEach(el => {
    const idx = Number(el.dataset.blank);

    el.addEventListener('dragover', (e) => {
      if (locked) return;
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (locked) return;
      const word = e.dataTransfer?.getData('text/plain') || dragWord;
      if (!word) return;
      placeWord(idx, word);
    });

    if (fills[idx] && !locked) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        const word = fills[idx];
        if (!word) return;
        dragWord = word;
        dragFromBlank = idx;
        e.dataTransfer?.setData('text/plain', word);
        e.dataTransfer!.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        dragWord = null;
        dragFromBlank = null;
      });
      el.addEventListener('dblclick', () => clearBlank(idx));
    }
  });
}

function renderBank(): void {
  if (!puzzle) {
    ui.bankEl.innerHTML = '';
    return;
  }

  const available = bankAvailability();
  const rendered = new Set<string>();
  const chips: string[] = [];

  for (const word of puzzle.words) {
    if (rendered.has(word)) continue;
    rendered.add(word);
    const left = available.get(word) ?? 0;
    const classes = ['word-chip'];
    if (left <= 0) classes.push('used');
    chips.push(
      `<button type="button" class="${classes.join(' ')}" data-word="${escapeAttr(word)}"
        draggable="${!locked && left > 0}" ${locked || left <= 0 ? 'disabled' : ''}>${escapeHtml(word)}</button>`,
    );
  }
  ui.bankEl.innerHTML = chips.join('');

  ui.bankEl.querySelectorAll<HTMLButtonElement>('.word-chip:not(.used)').forEach(btn => {
    const word = btn.dataset.word!;
    btn.addEventListener('dragstart', (e) => {
      dragWord = word;
      dragFromBlank = null;
      e.dataTransfer?.setData('text/plain', word);
      e.dataTransfer!.effectAllowed = 'move';
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      dragWord = null;
      dragFromBlank = null;
    });
  });

  ui.bankEl.addEventListener('dragover', onBankDragOver);
  ui.bankEl.addEventListener('drop', onBankDrop);
}

function onBankDragOver(e: DragEvent): void {
  if (locked) return;
  e.preventDefault();
}

function onBankDrop(e: DragEvent): void {
  e.preventDefault();
  if (locked || !puzzle) return;
  const word = e.dataTransfer?.getData('text/plain') || dragWord;
  if (!word) return;
  const idx = fills.findIndex(v => v === word);
  if (idx >= 0) clearBlank(idx);
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

function render(): void {
  // clone bank listeners carefully — remove old by replacing innerHTML only in renderBank
  const bank = ui.bankEl;
  const newBank = bank.cloneNode(false) as HTMLElement;
  bank.parentNode?.replaceChild(newBank, bank);
  ui.bankEl = newBank;

  renderSentence();
  renderBank();
  updateCheckVisibility();
}

async function loadPuzzle(): Promise<void> {
  locked = false;
  dragWord = null;
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
    ui.sentenceEl.textContent = '';
    ui.bankEl.innerHTML = '';
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
    ui.sentenceEl.querySelectorAll<HTMLElement>('.blank').forEach(el => {
      el.classList.add(result.correct ? 'correct' : 'wrong');
      el.draggable = false;
    });
    ui.bankEl.querySelectorAll<HTMLButtonElement>('.word-chip').forEach(btn => {
      btn.disabled = true;
      btn.draggable = false;
    });

    if (result.correct) {
      correctCount++;
      updateScore();
      showFeedback('Верно! Текст совпал.', 'correct');
      ui.nextBtn.classList.remove('hidden');
      ui.clearBtn.classList.add('hidden');
      ui.checkBtn.classList.add('hidden');
    } else {
      wrongCount++;
      updateScore();
      showFeedback('Неверно. Попробуйте другой текст или очистите и заполните заново.', 'wrong');
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
void ensureUserLogin().then(() => loadPuzzle());
