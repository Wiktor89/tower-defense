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
const levelLabelEl = document.getElementById('level-label');
const levelFillEl = document.getElementById('level-fill');

if (
  !sentenceEl || !bankEl || !feedbackEl || !checkBtn || !clearBtn || !nextBtn ||
  !scoreCorrectEl || !scoreWrongEl || !levelLabelEl || !levelFillEl
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
  levelLabelEl,
  levelFillEl,
};

let puzzle: FillBlanksPuzzle | null = null;
let fills: (string | null)[] = [];
let selectedBlank: number | null = null;
let selectedWord: string | null = null;
let locked = false;
let correctCount = 0;
let wrongCount = 0;
let level = 1;

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

function updateLevelBar(current: number, total: number): void {
  ui.levelLabelEl.textContent = `Фрагмент ${current} / ${total}`;
  ui.levelFillEl.style.width = `${(current / total) * 100}%`;
}

function updateCheckEnabled(): void {
  ui.checkBtn.disabled = locked || !puzzle || fills.some(v => !v);
}

function placeWord(blankIndex: number, word: string): void {
  if (!puzzle || locked) return;
  const prev = fills[blankIndex];
  fills[blankIndex] = word;
  if (prev && prev !== word) {
    // returned to bank via re-render
  }
  selectedBlank = null;
  selectedWord = null;
  render();
}

function clearBlank(blankIndex: number): void {
  if (locked) return;
  fills[blankIndex] = null;
  selectedBlank = null;
  selectedWord = null;
  render();
}

function usedWords(): Set<string> {
  const used = new Set<string>();
  for (const w of fills) {
    if (w) used.add(w);
  }
  return used;
}

function renderSentence(): void {
  if (!puzzle) {
    ui.sentenceEl.innerHTML = '';
    return;
  }

  const parts: string[] = [];
  for (let i = 0; i < puzzle.blankCount; i++) {
    parts.push(puzzle.fragments[i] ?? '');
    const value = fills[i];
    const classes = ['blank'];
    if (selectedBlank === i) classes.push('selected');
    if (value) classes.push('filled');
    const label = value ?? '····';
    parts.push(
      `<button type="button" class="${classes.join(' ')}" data-blank="${i}" ${locked ? 'disabled' : ''}>${label}</button>`,
    );
  }
  parts.push(puzzle.fragments[puzzle.blankCount] ?? '');
  ui.sentenceEl.innerHTML = parts.join('');

  ui.sentenceEl.querySelectorAll<HTMLButtonElement>('.blank').forEach(btn => {
    btn.addEventListener('click', () => {
      if (locked) return;
      const idx = Number(btn.dataset.blank);
      if (selectedWord) {
        placeWord(idx, selectedWord);
        return;
      }
      if (fills[idx]) {
        clearBlank(idx);
        return;
      }
      selectedBlank = selectedBlank === idx ? null : idx;
      render();
    });
  });
}

function renderBank(): void {
  if (!puzzle) {
    ui.bankEl.innerHTML = '';
    return;
  }

  const used = usedWords();
  ui.bankEl.innerHTML = puzzle.words.map(word => {
    const classes = ['word-chip'];
    if (selectedWord === word) classes.push('selected');
    if (used.has(word)) classes.push('used');
    return `<button type="button" class="${classes.join(' ')}" data-word="${word}" ${locked || used.has(word) ? 'disabled' : ''}>${word}</button>`;
  }).join('');

  ui.bankEl.querySelectorAll<HTMLButtonElement>('.word-chip:not(.used)').forEach(btn => {
    btn.addEventListener('click', () => {
      if (locked) return;
      const word = btn.dataset.word!;
      if (selectedBlank !== null) {
        placeWord(selectedBlank, word);
        return;
      }
      selectedWord = selectedWord === word ? null : word;
      render();
    });
  });
}

function render(): void {
  renderSentence();
  renderBank();
  updateCheckEnabled();
}

async function loadLevel(nextLevel: number): Promise<void> {
  locked = false;
  selectedBlank = null;
  selectedWord = null;
  hideFeedback();
  ui.nextBtn.classList.add('hidden');
  ui.checkBtn.classList.remove('hidden');
  ui.clearBtn.classList.remove('hidden');

  try {
    puzzle = await fetchFillBlanksPuzzle(nextLevel);
    level = puzzle.level;
    fills = Array.from({ length: puzzle.blankCount }, () => null);
    updateLevelBar(puzzle.level, puzzle.total);
    render();
  } catch {
    puzzle = null;
    ui.sentenceEl.textContent = '';
    ui.bankEl.innerHTML = '';
    showFeedback('Не удалось загрузить фрагмент. Проверьте backend.', 'wrong');
    ui.checkBtn.disabled = true;
  }
}

async function onCheck(): Promise<void> {
  if (!puzzle || locked || fills.some(v => !v)) return;

  locked = true;
  updateCheckEnabled();
  const user = getUser();
  const answers = fills.map(v => v!);

  try {
    const result = await checkFillBlanks(puzzle.id, answers, user?.id);
    ui.sentenceEl.querySelectorAll<HTMLButtonElement>('.blank').forEach(btn => {
      btn.classList.add(result.correct ? 'correct' : 'wrong');
      btn.disabled = true;
    });
    ui.bankEl.querySelectorAll<HTMLButtonElement>('.word-chip').forEach(btn => {
      btn.disabled = true;
    });

    if (result.correct) {
      correctCount++;
      updateScore();
      if (result.allComplete) {
        showFeedback('Отлично! Вся «Лигурия» собрана!', 'correct');
        ui.nextBtn.textContent = 'Сначала';
        ui.nextBtn.classList.remove('hidden');
        ui.checkBtn.classList.add('hidden');
        ui.clearBtn.classList.add('hidden');
      } else {
        showFeedback('Верно! Можно идти дальше.', 'correct');
        ui.nextBtn.textContent = 'Далее';
        ui.nextBtn.classList.remove('hidden');
        ui.checkBtn.classList.add('hidden');
        ui.clearBtn.classList.add('hidden');
      }
    } else {
      wrongCount++;
      updateScore();
      showFeedback('Неверно. Очистите и попробуйте снова.', 'wrong');
      ui.checkBtn.classList.add('hidden');
      ui.clearBtn.classList.remove('hidden');
      ui.nextBtn.classList.add('hidden');
      // allow retry: unlock after clear, need new puzzle id
      ui.clearBtn.textContent = 'Ещё раз';
    }
  } catch {
    locked = false;
    showFeedback('Ошибка проверки ответа', 'wrong');
    updateCheckEnabled();
  }
}

function onClear(): void {
  if (!puzzle) return;
  if (ui.clearBtn.textContent === 'Ещё раз') {
    ui.clearBtn.textContent = 'Очистить';
    void loadLevel(level);
    return;
  }
  if (locked) return;
  fills = fills.map(() => null);
  selectedBlank = null;
  selectedWord = null;
  hideFeedback();
  render();
}

ui.checkBtn.addEventListener('click', () => void onCheck());
ui.clearBtn.addEventListener('click', onClear);
ui.nextBtn.addEventListener('click', () => {
  if (ui.nextBtn.textContent === 'Сначала') {
    correctCount = 0;
    wrongCount = 0;
    updateScore();
    void loadLevel(1);
    return;
  }
  void loadLevel(level + 1);
});

updateScore();
void ensureUserLogin().then(() => loadLevel(1));
