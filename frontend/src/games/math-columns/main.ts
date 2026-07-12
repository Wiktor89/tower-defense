import './style.css';
import { checkMathAnswer, fetchMathProblem } from '../../api/client';
import type { MathProblem, OpMode } from '../../types';
import { ensureUserLogin } from '../../shared/login';
import { reportStats } from '../../shared/stats';
import { SESSION_SIZE, createBrainSvg, updateBrainProgress } from './brain';
import { splitDigits } from './utils';

const columnEl = document.getElementById('column');
const feedbackEl = document.getElementById('feedback');
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement | null;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
const hintBtn = document.getElementById('hint-btn') as HTMLButtonElement | null;
const scoreCorrectEl = document.getElementById('score-correct');
const scoreWrongEl = document.getElementById('score-wrong');
const progressFillEl = document.getElementById('progress-fill');
const progressBrainEl = document.getElementById('progress-brain');
const progressTextEl = document.getElementById('progress-text');

if (
  !columnEl || !feedbackEl || !checkBtn || !nextBtn || !hintBtn ||
  !scoreCorrectEl || !scoreWrongEl || !progressFillEl || !progressBrainEl || !progressTextEl
) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  columnEl,
  feedbackEl,
  checkBtn,
  nextBtn,
  hintBtn,
  scoreCorrectEl,
  scoreWrongEl,
  progressFillEl,
  progressBrainEl,
  progressTextEl,
};

let level = 1;
let opMode: OpMode = 'add';
let problem: MathProblem | null = null;
let answered = false;
let correct = 0;
let wrong = 0;
let sessionSolved = 0;
let sessionComplete = false;

ui.progressBrainEl.innerHTML = createBrainSvg();

const progressElements = {
  fillEl: ui.progressFillEl,
  brainEl: ui.progressBrainEl,
  textEl: ui.progressTextEl,
  wrinkles: ui.progressBrainEl.querySelectorAll<SVGPathElement>('.brain-wrinkle'),
};

function updateProgress(): void {
  updateBrainProgress(sessionSolved, progressElements);
}

function resetSession(): void {
  sessionSolved = 0;
  sessionComplete = false;
  correct = 0;
  wrong = 0;
  updateScore();
  updateProgress();
  ui.nextBtn.textContent = 'Следующий пример';
}

async function renderColumn(): Promise<void> {
  if (sessionComplete) return;

  try {
    problem = await fetchMathProblem(level, opMode);
  } catch {
    showFeedback('Не удалось загрузить пример. Проверьте backend.', 'wrong');
    return;
  }

  answered = false;
  const { a, b, op, width } = problem;
  const aDigits = splitDigits(a, width);
  const bDigits = splitDigits(b, width);

  ui.columnEl.innerHTML = `
    <div class="column-row">
      <span class="column-sign"></span>
      ${aDigits.map(d => `<span class="column-digit">${d === ' ' ? '' : d}</span>`).join('')}
    </div>
    <div class="column-row">
      <span class="column-sign">${op}</span>
      ${bDigits.map(d => `<span class="column-digit">${d === ' ' ? '' : d}</span>`).join('')}
    </div>
    <div class="column-line"></div>
    <div class="answer-row" id="answer-row">
      <span class="column-sign"></span>
      ${Array.from({ length: width }, (_, i) =>
        `<input class="digit-input" type="text" inputmode="numeric" maxlength="1"
          data-index="${i}" aria-label="Цифра ${i + 1}">`
      ).join('')}
    </div>
  `;

  const inputs = ui.columnEl.querySelectorAll<HTMLInputElement>('.digit-input');
  inputs.forEach((input, i) => {
    input.addEventListener('input', () => onDigitInput(input, i, inputs));
    input.addEventListener('keydown', (e) => onDigitKeydown(e, i, inputs));
  });

  hideFeedback();
  ui.checkBtn.classList.remove('hidden');
  ui.nextBtn.classList.add('hidden');
  ui.hintBtn.disabled = false;
  inputs[0]?.focus();
}

function onDigitInput(input: HTMLInputElement, index: number, inputs: NodeListOf<HTMLInputElement>): void {
  input.value = input.value.replace(/\D/g, '').slice(-1);
  if (input.value && index < inputs.length - 1) {
    inputs[index + 1]?.focus();
  }
}

function onDigitKeydown(
  e: KeyboardEvent,
  index: number,
  inputs: NodeListOf<HTMLInputElement>,
): void {
  const target = e.target as HTMLInputElement;
  if (e.key === 'Backspace' && !target.value && index > 0) {
    const prev = inputs[index - 1];
    if (prev) {
      prev.focus();
      prev.value = '';
    }
  }
  if (e.key === 'Enter') {
    if (sessionComplete) {
      resetSession();
      void renderColumn();
      return;
    }
    if (!answered) void checkAnswer();
    else void renderColumn();
  }
  if (e.key === 'ArrowLeft' && index > 0) inputs[index - 1]?.focus();
  if (e.key === 'ArrowRight' && index < inputs.length - 1) inputs[index + 1]?.focus();
}

function getUserAnswer(): number | null {
  const inputs = ui.columnEl.querySelectorAll<HTMLInputElement>('.digit-input');
  const raw = Array.from(inputs).map(i => i.value).join('');
  if (!raw || raw.length < inputs.length) return null;
  return parseInt(raw, 10);
}

function completeSession(): void {
  sessionComplete = true;
  void reportStats('math-columns', { sessionsCompleted: 1 });
  showFeedback(`Серия из ${SESSION_SIZE} примеров завершена! Мозг вырос! 🧠`, 'correct');
  ui.checkBtn.classList.add('hidden');
  ui.nextBtn.textContent = 'Новая серия';
  ui.nextBtn.classList.remove('hidden');
  ui.hintBtn.disabled = true;
  updateProgress();
}

async function checkAnswer(): Promise<void> {
  if (sessionComplete || !problem) return;

  const userAnswer = getUserAnswer();
  if (userAnswer === null) {
    showFeedback('Введите все цифры ответа', 'hint');
    return;
  }

  answered = true;
  const inputs = ui.columnEl.querySelectorAll<HTMLInputElement>('.digit-input');

  try {
    const result = await checkMathAnswer(problem.id, userAnswer);
    const isCorrect = result.correct;

    inputs.forEach(input => {
      input.disabled = true;
      input.classList.add(isCorrect ? 'correct' : 'wrong');
    });

    if (isCorrect) {
      correct++;
      sessionSolved++;
      void reportStats('math-columns', { correct: 1 });
      updateProgress();
      showFeedback('Верно! 🎉', 'correct');

      if (sessionSolved >= SESSION_SIZE) {
        completeSession();
        updateScore();
        return;
      }
    } else {
      wrong++;
      void reportStats('math-columns', { wrong: 1 });
      showFeedback(`Неверно. Правильный ответ: ${result.correctAnswer ?? '?'}`, 'wrong');
    }
  } catch {
    showFeedback('Ошибка проверки ответа', 'wrong');
    answered = false;
    return;
  }

  updateScore();
  ui.checkBtn.classList.add('hidden');
  ui.nextBtn.classList.remove('hidden');
}

function showHint(): void {
  if (answered || sessionComplete || !problem) return;
  const { a, b, op } = problem;
  const hint = op === '+'
    ? `Складываем ${a} и ${b}. Начни с младших разрядов.`
    : `Вычитаем ${b} из ${a}. Начни с младших разрядов.`;
  showFeedback(hint, 'hint');
}

function showFeedback(text: string, type: 'correct' | 'wrong' | 'hint'): void {
  ui.feedbackEl.textContent = text;
  ui.feedbackEl.className = `feedback ${type}`;
}

function hideFeedback(): void {
  ui.feedbackEl.className = 'feedback hidden';
}

function updateScore(): void {
  ui.scoreCorrectEl.textContent = `✓ ${correct}`;
  ui.scoreWrongEl.textContent = `✗ ${wrong}`;
}

function onSettingsChange(): void {
  resetSession();
  void renderColumn();
}

document.querySelectorAll<HTMLButtonElement>('#level-btns .ctrl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#level-btns .ctrl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    level = Number(btn.dataset.level);
    onSettingsChange();
  });
});

document.querySelectorAll<HTMLButtonElement>('#op-btns .ctrl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#op-btns .ctrl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    opMode = btn.dataset.op as OpMode;
    onSettingsChange();
  });
});

ui.checkBtn.addEventListener('click', () => void checkAnswer());
ui.nextBtn.addEventListener('click', () => {
  if (sessionComplete) {
    resetSession();
    void renderColumn();
  } else {
    void renderColumn();
  }
});
ui.hintBtn.addEventListener('click', showHint);

updateProgress();
void ensureUserLogin().then(() => renderColumn());
