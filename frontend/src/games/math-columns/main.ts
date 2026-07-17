import './style.css';
import '../../shared/tv-controls.css';
import {
  checkMathAnswer,
  fetchMathColumnsSettings,
  fetchMathProblem,
  fetchMathSession,
  resetMathSession,
} from '../../api/client';
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

function applySession(p: {
  solved: number;
  correct: number;
  wrong: number;
  complete: boolean;
  sessionSize?: number;
}): void {
  sessionSolved = p.solved;
  correct = p.correct;
  wrong = p.wrong;
  sessionComplete = p.complete;
  if (typeof p.sessionSize === 'number' && p.sessionSize > 0) {
    sessionSize = p.sessionSize;
  }
  updateScore();
  updateProgress();
  if (sessionComplete) {
    ui.nextBtn.textContent = 'Новая серия';
    ui.nextBtn.classList.remove('hidden');
    ui.hintBtn.disabled = true;
    showFeedback(`Серия из ${sessionSize} примеров уже завершена сегодня.`, 'correct');
  } else {
    ui.nextBtn.textContent = 'Следующий пример';
    ui.hintBtn.disabled = false;
  }
}

async function startNewSeries(): Promise<void> {
  try {
    const p = await resetMathSession(userId);
    applySession({ ...p, sessionSize });
    sessionComplete = false;
    ui.nextBtn.classList.add('hidden');
    ui.nextBtn.textContent = 'Следующий пример';
    ui.hintBtn.disabled = false;
    hideFeedback();
    await renderColumn();
  } catch {
    showFeedback('Не удалось начать новую серию.', 'wrong');
  }
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
    <div class="column-sum">
      <div class="column-row">
        <span class="column-sign"></span>
        ${aDigits.map(d => `<span class="column-digit">${d === ' ' ? '' : d}</span>`).join('')}
      </div>
      <div class="column-row">
        <span class="column-sign">${op}</span>
        ${bDigits.map(d => `<span class="column-digit">${d === ' ' ? '' : d}</span>`).join('')}
      </div>
      <div class="column-line"></div>
    </div>
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

    if (typeof result.sessionSolved === 'number') {
      sessionSolved = result.sessionSolved;
    }

    if (isCorrect) {
      correct += 1;
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

      window.setTimeout(() => {
        if (!sessionComplete) void renderColumn();
      }, 450);
      return;
    }

    wrong += 1;
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
    void startNewSeries();
  } else {
    void renderColumn();
  }
});
ui.hintBtn.addEventListener('click', showHint);

updateProgress();
void ensureUserLogin()
  .then(async user => {
    userId = user.id;
    const [settings, session] = await Promise.all([
      fetchMathColumnsSettings().catch(() => null),
      fetchMathSession(userId).catch(() => null),
    ]);
    if (settings) sessionSize = settings.sessionSize;
    if (session) {
      applySession(session);
    } else {
      updateProgress();
    }
    if (!sessionComplete) {
      await renderColumn();
    }
  })
  .catch(() => {
    sessionSize = DEFAULT_SESSION_SIZE;
    updateProgress();
  });
