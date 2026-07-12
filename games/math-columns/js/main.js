import { generateProblem, splitDigits } from './problem.js';
import { SESSION_SIZE, createBrainSvg, updateBrainProgress } from './brain.js';

const columnEl = document.getElementById('column');
const feedbackEl = document.getElementById('feedback');
const checkBtn = document.getElementById('check-btn');
const nextBtn = document.getElementById('next-btn');
const hintBtn = document.getElementById('hint-btn');
const scoreCorrectEl = document.getElementById('score-correct');
const scoreWrongEl = document.getElementById('score-wrong');
const progressFillEl = document.getElementById('progress-fill');
const progressBrainEl = document.getElementById('progress-brain');
const progressTextEl = document.getElementById('progress-text');

let level = 1;
let opMode = 'add';
let problem = null;
let answered = false;
let correct = 0;
let wrong = 0;
let sessionSolved = 0;
let sessionComplete = false;

const brainEl = progressBrainEl;
brainEl.innerHTML = createBrainSvg();
const brainWrinkles = brainEl.querySelectorAll('.brain-wrinkle');

const progressElements = {
  fillEl: progressFillEl,
  brainEl: progressBrainEl,
  textEl: progressTextEl,
  wrinkles: brainWrinkles,
};

function updateProgress() {
  updateBrainProgress(sessionSolved, progressElements);
}

function resetSession() {
  sessionSolved = 0;
  sessionComplete = false;
  correct = 0;
  wrong = 0;
  updateScore();
  updateProgress();
  nextBtn.textContent = 'Следующий пример';
}

function renderColumn() {
  if (sessionComplete) return;

  problem = generateProblem(level, opMode);
  answered = false;

  const { a, b, op, width } = problem;
  const aDigits = splitDigits(a, width);
  const bDigits = splitDigits(b, width);

  columnEl.innerHTML = `
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

  const inputs = columnEl.querySelectorAll('.digit-input');
  inputs.forEach((input, i) => {
    input.addEventListener('input', () => onDigitInput(input, i, inputs));
    input.addEventListener('keydown', (e) => onDigitKeydown(e, i, inputs));
  });

  hideFeedback();
  checkBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  hintBtn.disabled = false;

  inputs[0].focus();
}

function onDigitInput(input, index, inputs) {
  input.value = input.value.replace(/\D/g, '').slice(-1);
  if (input.value && index < inputs.length - 1) {
    inputs[index + 1].focus();
  }
}

function onDigitKeydown(e, index, inputs) {
  if (e.key === 'Backspace' && !e.target.value && index > 0) {
    inputs[index - 1].focus();
    inputs[index - 1].value = '';
  }
  if (e.key === 'Enter') {
    if (sessionComplete) {
      resetSession();
      renderColumn();
      return;
    }
    if (!answered) checkAnswer();
    else renderColumn();
  }
  if (e.key === 'ArrowLeft' && index > 0) inputs[index - 1].focus();
  if (e.key === 'ArrowRight' && index < inputs.length - 1) inputs[index + 1].focus();
}

function getUserAnswer() {
  const inputs = columnEl.querySelectorAll('.digit-input');
  const raw = Array.from(inputs).map(i => i.value).join('');
  if (!raw || raw.length < inputs.length) return null;
  return parseInt(raw, 10);
}

function completeSession() {
  sessionComplete = true;
  showFeedback(`Серия из ${SESSION_SIZE} примеров завершена! Мозг вырос! 🧠`, 'correct');
  checkBtn.classList.add('hidden');
  nextBtn.textContent = 'Новая серия';
  nextBtn.classList.remove('hidden');
  hintBtn.disabled = true;
  updateProgress();
}

function checkAnswer() {
  if (sessionComplete) return;

  const userAnswer = getUserAnswer();
  if (userAnswer === null) {
    showFeedback('Введите все цифры ответа', 'hint');
    return;
  }

  answered = true;
  const inputs = columnEl.querySelectorAll('.digit-input');
  const isCorrect = userAnswer === problem.answer;

  inputs.forEach(input => {
    input.disabled = true;
    input.classList.add(isCorrect ? 'correct' : 'wrong');
  });

  if (isCorrect) {
    correct++;
    sessionSolved++;
    updateProgress();
    showFeedback('Верно! 🎉', 'correct');

    if (sessionSolved >= SESSION_SIZE) {
      completeSession();
      updateScore();
      return;
    }
  } else {
    wrong++;
    showFeedback(`Неверно. Правильный ответ: ${problem.answer}`, 'wrong');
  }

  updateScore();
  checkBtn.classList.add('hidden');
  nextBtn.classList.remove('hidden');
}

function showHint() {
  if (answered || sessionComplete) return;
  const { a, b, op } = problem;
  const hint = op === '+'
    ? `Складываем ${a} и ${b}. Начни с младших разрядов.`
    : `Вычитаем ${b} из ${a}. Начни с младших разрядов.`;
  showFeedback(hint, 'hint');
}

function showFeedback(text, type) {
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback ${type}`;
}

function hideFeedback() {
  feedbackEl.className = 'feedback hidden';
}

function updateScore() {
  scoreCorrectEl.textContent = `✓ ${correct}`;
  scoreWrongEl.textContent = `✗ ${wrong}`;
}

function onSettingsChange() {
  resetSession();
  renderColumn();
}

document.querySelectorAll('#level-btns .ctrl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#level-btns .ctrl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    level = Number(btn.dataset.level);
    onSettingsChange();
  });
});

document.querySelectorAll('#op-btns .ctrl-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#op-btns .ctrl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    opMode = btn.dataset.op;
    onSettingsChange();
  });
});

checkBtn.addEventListener('click', checkAnswer);
nextBtn.addEventListener('click', () => {
  if (sessionComplete) {
    resetSession();
    renderColumn();
  } else {
    renderColumn();
  }
});
hintBtn.addEventListener('click', showHint);

updateProgress();
renderColumn();
