import './style.css';
import '../../shared/tv-controls.css';
import { checkMathAnswer, fetchMathColumnsSettings, fetchMathProblem } from '../../api/client';
import type { MathProblem } from '../../types';
import { ensureUserLogin } from '../../shared/login';
import { showChallengeReward } from '../../shared/solar-reward';
import { getUser } from '../../shared/user';
import { DEFAULT_SESSION_SIZE, createBrainSvg, updateBrainProgress } from './brain';
import { splitDigits } from './utils';

document.body.classList.add('tv-ready');

const columnEl = document.getElementById('column');
const feedbackEl = document.getElementById('feedback');
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
const hintBtn = document.getElementById('hint-btn') as HTMLButtonElement | null;
const scoreCorrectEl = document.getElementById('score-correct');
const scoreWrongEl = document.getElementById('score-wrong');
const progressFillEl = document.getElementById('progress-fill');
const progressBrainEl = document.getElementById('progress-brain');
const progressTextEl = document.getElementById('progress-text');

if (
  !columnEl || !feedbackEl || !nextBtn || !hintBtn ||
  !scoreCorrectEl || !scoreWrongEl || !progressFillEl || !progressBrainEl || !progressTextEl
) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  columnEl,
  feedbackEl,
  nextBtn,
  hintBtn,
  scoreCorrectEl,
  scoreWrongEl,
  progressFillEl,
  progressBrainEl,
  progressTextEl,
};

let problem: MathProblem | null = null;
let answered = false;
let correct = 0;
let wrong = 0;
let sessionSolved = 0;
let sessionComplete = false;
let sessionSize = DEFAULT_SESSION_SIZE;
let userId = 0;

ui.progressBrainEl.innerHTML = createBrainSvg();

const progressElements = {
  fillEl: ui.progressFillEl,
  brainEl: ui.progressBrainEl,
  textEl: ui.progressTextEl,
  wrinkles: ui.progressBrainEl.querySelectorAll<SVGPathElement>('.brain-wrinkle'),
};

function updateProgress(): void {
  updateBrainProgress(sessionSolved, sessionSize, progressElements);
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
  if (!userId) {
    showFeedback('Войдите в аккаунт, чтобы получать примеры.', 'wrong');
    return;
  }

  try {
    problem = await fetchMathProblem(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    showFeedback(
      msg.toLowerCase().includes('grade')
        ? 'Администратор ещё не назначил ваш класс.'
        : 'Не удалось загрузить пример. Проверьте backend.',
      'wrong',
    );
    return;
  }

  answered = false;
  const { a, b, op, width, options } = problem;
  const aDigits = splitDigits(a, width);
  const bDigits = splitDigits(b, width);
  const choices = options?.length === 4 ? options : [0, 1, 2, 3];

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
    <div class="choices" id="choices" role="group" aria-label="Варианты ответа">
      ${choices.map(v => `
        <button type="button" class="choice-btn" data-value="${v}">${v}</button>
      `).join('')}
    </div>
  `;

  ui.columnEl.querySelectorAll<HTMLButtonElement>('.choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (answered || sessionComplete) return;
      void checkAnswer(Number(btn.dataset.value));
    });
  });

  hideFeedback();
  ui.nextBtn.classList.add('hidden');
  ui.hintBtn.disabled = false;
}

function finishSessionUI(): void {
  sessionComplete = true;
  ui.nextBtn.textContent = 'Новая серия';
  ui.nextBtn.classList.remove('hidden');
  ui.hintBtn.disabled = true;
  updateProgress();
}

function lockChoices(selected: number, isCorrect: boolean, correctAnswer?: number): void {
  ui.columnEl.querySelectorAll<HTMLButtonElement>('.choice-btn').forEach(btn => {
    const value = Number(btn.dataset.value);
    btn.disabled = true;
    if (value === selected) {
      btn.classList.add(isCorrect ? 'correct' : 'wrong');
    }
    if (!isCorrect && correctAnswer !== undefined && value === correctAnswer) {
      btn.classList.add('correct');
    }
  });
}

async function checkAnswer(userAnswer: number): Promise<void> {
  if (sessionComplete || !problem || answered) return;

  answered = true;
  const user = getUser();

  try {
    const result = await checkMathAnswer(problem.id, userAnswer, user?.id);
    const isCorrect = result.correct;
    lockChoices(userAnswer, isCorrect, result.correctAnswer);

    if (isCorrect) {
      correct++;
      if (typeof result.sessionSolved === 'number') {
        sessionSolved = result.sessionSolved;
      } else {
        sessionSolved++;
      }
      updateProgress();
      updateScore();
      showFeedback('Верно!', 'correct');

      const done = result.sessionComplete || sessionSolved >= sessionSize;
      if (done) {
        sessionSolved = sessionSize;
        finishSessionUI();
        showFeedback(`Серия из ${sessionSize} примеров завершена! Мозг вырос!`, 'correct');
        if (result.stageCompletion) showChallengeReward(result.stageCompletion);
        return;
      }

      // Верный клик = ответ, сразу следующий пример.
      window.setTimeout(() => {
        if (!sessionComplete) void renderColumn();
      }, 450);
      return;
    }

    wrong++;
    updateScore();
    showFeedback(`Неверно. Правильный ответ: ${result.correctAnswer ?? '?'}`, 'wrong');
    ui.nextBtn.classList.remove('hidden');
  } catch {
    showFeedback('Ошибка проверки ответа', 'wrong');
    answered = false;
    ui.columnEl.querySelectorAll<HTMLButtonElement>('.choice-btn').forEach(btn => {
      btn.disabled = false;
    });
  }
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
void ensureUserLogin()
  .then(user => {
    userId = user.id;
    return fetchMathColumnsSettings();
  })
  .then(settings => {
    sessionSize = settings.sessionSize;
    updateProgress();
  })
  .catch(() => {
    sessionSize = DEFAULT_SESSION_SIZE;
    updateProgress();
  })
  .then(() => renderColumn());
