import './style.css';
import '../../shared/tv-controls.css';
import {
  checkFractionAnswer,
  completeFractionsTutorial,
  fetchFractionProblem,
  fetchFractionsSession,
  fetchFractionsTutorial,
} from '../../api/client';
import type { FractionProblem, FractionVisualHint } from '../../types';
import { ensureUserLogin } from '../../shared/login';
import { showChallengeReward } from '../../shared/solar-reward';
import { setupLab } from './lab';
import { countSelected, renderPie } from './pie';
import { clearLegacyTutorialFlag, createTutorialController, hadLegacyTutorialFlag } from './tutorial';

document.body.classList.add('tv-ready');

const gateEl = document.getElementById('gate');
const playEl = document.getElementById('play');
const tutorialEl = document.getElementById('tutorial');
const gateEyebrow = document.getElementById('gate-eyebrow');
const gateHeading = document.getElementById('gate-heading');
const gateDesc = document.getElementById('gate-desc');
const gatePhase = document.getElementById('gate-phase');
const gateError = document.getElementById('gate-error');
const learnBtn = document.getElementById('learn-btn') as HTMLButtonElement | null;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;
const labOpenBtn = document.getElementById('lab-open-btn') as HTMLButtonElement | null;
const labBtn = document.getElementById('lab-btn') as HTMLButtonElement | null;
const labPanel = document.getElementById('lab');
const labPie = document.getElementById('lab-pie');
const labFrac = document.getElementById('lab-frac');
const labParts = document.getElementById('lab-parts') as HTMLInputElement | null;
const labPartsVal = document.getElementById('lab-parts-val');
const labCloseBtn = document.getElementById('lab-close-btn');
const questGrade = document.getElementById('quest-grade');
const questTitle = document.getElementById('quest-title');
const promptEl = document.getElementById('prompt');
const stageEl = document.getElementById('stage');
const hintPieEl = document.getElementById('hint-pie');
const feedbackEl = document.getElementById('feedback');
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement | null;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement | null;
const rankTitleEl = document.getElementById('rank-title');
const scoreCorrectEl = document.getElementById('score-correct');
const scoreWrongEl = document.getElementById('score-wrong');
const tutorialProgress = document.getElementById('tutorial-progress');
const tutorialTitle = document.getElementById('tutorial-title');
const tutorialBody = document.getElementById('tutorial-body');
const tutorialTip = document.getElementById('tutorial-tip');
const tutorialPie = document.getElementById('tutorial-pie');
const quizPrompt = document.getElementById('quiz-prompt');
const quizStage = document.getElementById('quiz-stage');
const tutorialFeedback = document.getElementById('tutorial-feedback');
const tutorialPrev = document.getElementById('tutorial-prev') as HTMLButtonElement | null;
const tutorialNext = document.getElementById('tutorial-next') as HTMLButtonElement | null;
const lessonPane = document.getElementById('lesson-pane');
const quizPane = document.getElementById('quiz-pane');

if (
  !gateEl || !playEl || !tutorialEl || !gateEyebrow || !gateHeading || !gateDesc || !gatePhase ||
  !gateError || !learnBtn || !startBtn || !labOpenBtn || !labBtn || !labPanel || !labPie ||
  !labFrac || !labParts || !labPartsVal || !labCloseBtn || !questGrade || !questTitle ||
  !promptEl || !stageEl || !hintPieEl || !feedbackEl || !checkBtn || !nextBtn ||
  !rankTitleEl || !scoreCorrectEl || !scoreWrongEl || !tutorialProgress || !tutorialTitle ||
  !tutorialBody || !tutorialTip || !tutorialPie || !quizPrompt || !quizStage ||
  !tutorialFeedback || !tutorialPrev || !tutorialNext || !lessonPane || !quizPane
) {
  throw new Error('Missing required DOM elements');
}

const ui = {
  gateEl, playEl, tutorialEl, gateEyebrow, gateHeading, gateDesc, gatePhase, gateError,
  learnBtn, startBtn, questGrade, questTitle, promptEl, stageEl, hintPieEl, feedbackEl,
  checkBtn, nextBtn, rankTitleEl, scoreCorrectEl, scoreWrongEl,
};

let userId = 0;
let unlocked = false;
let problem: FractionProblem | null = null;
let locked = false;
let correctCount = 0;
let wrongCount = 0;
let pieSelected: boolean[] = [];
let comparePick: 'a' | 'b' | null = null;
let userGrade: number | null = null;

const PHASES: Record<number, string> = {
  1: 'Фаза «Знакомство с долями» — половины и равные части',
  2: 'Фаза «Знакомство с долями» — деление как обратное умножению',
  3: 'Фаза «Знакомство с долями» — числитель и знаменатель',
  4: 'Фаза «Знакомство с долями» — сравнение дробей',
  5: 'Фаза «Мастера Дробей» — сокращение и смешанные числа',
  6: 'Фаза «Мастера Дробей» — операции с дробями',
  7: 'Фаза «Абстракция и Алгебра» — проценты и пропорции',
  8: 'Фаза «Абстракция и Алгебра» — ОДЗ и ловушки',
  9: 'Фаза «Абстракция и Алгебра» — бой с боссом',
};

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

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

function showVisualHint(hint?: FractionVisualHint): void {
  if (!hint?.parts) {
    ui.hintPieEl.classList.add('hidden');
    return;
  }
  ui.hintPieEl.classList.remove('hidden');
  ui.hintPieEl.innerHTML = `<div class="hint-pie-canvas"></div><p></p>`;
  const canvas = ui.hintPieEl.querySelector<HTMLElement>('.hint-pie-canvas')!;
  const label = ui.hintPieEl.querySelector('p')!;
  renderPie(canvas, { parts: hint.parts, take: hint.take ?? 0, size: 160 });
  label.textContent = hint.label
    ?? `Вспомни пирог: ${hint.take ?? 0} из ${hint.parts} частей`;
}

function renderGate(): void {
  ui.gateEl.classList.remove('hidden');
  ui.playEl.classList.add('hidden');
  ui.tutorialEl.classList.add('hidden');

  if (!unlocked) {
    ui.gateEyebrow.textContent = 'Обязательное обучение';
    ui.gateHeading.textContent = 'Что такое дроби?';
    ui.gateDesc.textContent =
      'Перед квестами пройди короткое обучение: равные части, половина, четверть и запись дроби. Затем сдашь мини-тест из 3 вопросов — только после этого откроется «Деление и дроби».';
    ui.gatePhase.textContent = 'Квесты заблокированы, пока не сдан мини-тест';
    ui.learnBtn.classList.remove('hidden');
    ui.startBtn.classList.add('hidden');
    ui.startBtn.disabled = true;
    return;
  }

  ui.learnBtn.classList.add('hidden');
  ui.startBtn.classList.remove('hidden');
  ui.gateEyebrow.textContent = 'Обучение пройдено';

  if (!userGrade) {
    ui.gateHeading.textContent = 'Класс ещё не назначен';
    ui.gateDesc.textContent = 'Попросите администратора указать ваш класс (1–9). Лабораторию можно открыть уже сейчас.';
    ui.gatePhase.textContent = 'Ожидание класса';
    ui.startBtn.disabled = true;
    return;
  }

  const capped = Math.min(userGrade, 9);
  ui.gateHeading.textContent = `${capped} класс — квесты открыты`;
  ui.gateDesc.textContent =
    'Мир потерял целостность. Чини мосты и распределяй ресурсы с помощью деления и дробей.';
  ui.gatePhase.textContent = PHASES[capped] ?? PHASES[9] ?? '';
  ui.startBtn.disabled = false;
}

function renderShareLike(): void {
  const total = num(problem?.payload.total);
  const friends = num(problem?.payload.friends || problem?.payload.boxes);
  const emoji = String(problem?.payload.emoji ?? '🍎');
  ui.stageEl.innerHTML = `
    <div class="emoji-row" style="font-size:1.6rem;letter-spacing:2px">${emoji.repeat(Math.min(total, 24))}</div>
    <div class="answer-row">
      <label>Ответ <input id="ans-int" type="number" min="0" step="1" inputmode="numeric"></label>
    </div>
    <p class="odz-warn">${friends} равных доли — никого не обидь.</p>
  `;
}

function renderPieQuest(): void {
  const parts = num(problem?.payload.parts, 4);
  pieSelected = Array.from({ length: parts }, () => false);
  ui.stageEl.innerHTML = `
    <div id="pie-canvas"></div>
    <div class="frac-inputs">
      <input id="ans-num" type="number" min="0" step="1" inputmode="numeric" placeholder="числ.">
      <span>/</span>
      <input id="ans-den" type="number" min="1" step="1" inputmode="numeric" placeholder="знам.">
    </div>
    <p class="odz-warn">Кликай кусочки пиццы, затем запиши дробь.</p>
  `;
  const canvas = ui.stageEl.querySelector<HTMLElement>('#pie-canvas')!;
  const syncInputs = (): void => {
    const numEl = ui.stageEl.querySelector<HTMLInputElement>('#ans-num');
    const denEl = ui.stageEl.querySelector<HTMLInputElement>('#ans-den');
    if (numEl) numEl.value = String(countSelected(pieSelected));
    if (denEl) denEl.value = String(parts);
  };
  renderPie(canvas, {
    parts,
    selected: pieSelected,
    interactive: true,
    onToggle: (_i, next) => {
      pieSelected = next;
      syncInputs();
    },
  });
  syncInputs();
}

function renderCompare(): void {
  comparePick = null;
  const aNum = num(problem?.payload.aNum);
  const aDen = num(problem?.payload.aDen);
  const bNum = num(problem?.payload.bNum);
  const bDen = num(problem?.payload.bDen);
  ui.stageEl.innerHTML = `
    <div class="compare-btns">
      <button type="button" class="action-btn" data-pick="a">Мост ${aNum}/${aDen}</button>
      <button type="button" class="action-btn" data-pick="b">Мост ${bNum}/${bDen}</button>
    </div>
    <p class="odz-warn">Выбери более длинный мост (большую долю).</p>
  `;
  ui.stageEl.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (locked) return;
      comparePick = btn.dataset.pick === 'b' ? 'b' : 'a';
      ui.stageEl.querySelectorAll('[data-pick]').forEach(b => b.classList.remove('is-picked'));
      btn.classList.add('is-picked');
    });
  });
}

function renderFracInputs(withLabel = 'Сокращённая дробь'): void {
  ui.stageEl.innerHTML = `
    <div class="frac-inputs">
      <input id="ans-num" type="number" step="1" inputmode="numeric" placeholder="числ.">
      <span>/</span>
      <input id="ans-den" type="number" min="1" step="1" inputmode="numeric" placeholder="знам.">
    </div>
    <p class="odz-warn">${withLabel}</p>
  `;
}

function renderIntAnswer(warn: string): void {
  ui.stageEl.innerHTML = `
    <div class="answer-row">
      <label>Ответ <input id="ans-int" type="number" step="1" inputmode="numeric"></label>
    </div>
    <p class="odz-warn">${warn}</p>
  `;
}

function renderODZ(): void {
  const latex = String(problem?.payload.latex ?? '');
  ui.stageEl.innerHTML = `
    <p style="font-size:1.4rem;font-weight:800">${latex}</p>
    <div class="answer-row">
      <label>x = <input id="ans-int" type="number" step="1" inputmode="numeric"></label>
    </div>
    <p class="odz-warn">Осторожно: если знаменатель станет 0 — ловушка сработает.</p>
  `;
}

function renderStage(): void {
  if (!problem) return;
  ui.questGrade.textContent = `${problem.grade} класс`;
  ui.questTitle.textContent = problem.title;
  ui.promptEl.textContent = problem.prompt;
  ui.hintPieEl.classList.add('hidden');
  hideFeedback();
  locked = false;
  ui.checkBtn.disabled = false;
  ui.checkBtn.classList.remove('hidden');
  ui.nextBtn.classList.add('hidden');

  switch (problem.kind) {
    case 'share':
    case 'boxes':
      renderShareLike();
      break;
    case 'pie':
      renderPieQuest();
      break;
    case 'compare':
      renderCompare();
      break;
    case 'simplify':
    case 'add':
    case 'boss':
      renderFracInputs(problem.kind === 'boss' ? 'Несократимая дробь урона' : 'Запиши дробь');
      break;
    case 'percent':
      renderIntAnswer('Сколько монет составит скидка?');
      break;
    case 'odz':
      renderODZ();
      break;
    default:
      renderIntAnswer('Введи ответ');
  }
}

function readAnswer(): number | string | { num: number; den: number } | null {
  if (!problem) return null;
  switch (problem.kind) {
    case 'compare':
      return comparePick;
    case 'pie':
    case 'simplify':
    case 'add':
    case 'boss': {
      const n = Number(ui.stageEl.querySelector<HTMLInputElement>('#ans-num')?.value);
      const d = Number(ui.stageEl.querySelector<HTMLInputElement>('#ans-den')?.value);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { num: n, den: d };
    }
    default: {
      const v = Number(ui.stageEl.querySelector<HTMLInputElement>('#ans-int')?.value);
      return Number.isFinite(v) ? v : null;
    }
  }
}

async function loadProblem(): Promise<void> {
  if (!unlocked) {
    showFeedback('Сначала пройди обучение и мини-тест.', 'hint');
    return;
  }
  try {
    problem = await fetchFractionProblem(userId);
    renderStage();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    showFeedback(
      msg.toLowerCase().includes('grade')
        ? 'Администратор ещё не назначил ваш класс.'
        : 'Не удалось загрузить квест. Проверьте backend.',
      'wrong',
    );
  }
}

async function onCheck(): Promise<void> {
  if (!problem || locked || !unlocked) return;
  const answer = readAnswer();
  if (answer === null) {
    showFeedback('Сначала выбери или введи ответ.', 'hint');
    return;
  }
  try {
    const result = await checkFractionAnswer(problem.id, answer, userId);
    locked = true;
    ui.checkBtn.disabled = true;
    ui.nextBtn.classList.remove('hidden');
    if (typeof result.dayCorrect === 'number') correctCount = result.dayCorrect;
    else if (result.correct) correctCount += 1;
    if (typeof result.dayWrong === 'number') wrongCount = result.dayWrong;
    else if (!result.correct) wrongCount += 1;
    updateScore();
    if (result.rankTitle) ui.rankTitleEl.textContent = result.rankTitle;

    if (result.correct) {
      showFeedback('Верно! Целостность восстановлена.', 'correct');
      if (result.challengeReward) showChallengeReward(result.challengeReward);
    } else {
      showFeedback('Пока мимо. Смотри визуальную подсказку — это откат к долям.', 'wrong');
      showVisualHint(result.visualHint);
    }
  } catch {
    showFeedback('Ошибка проверки. Попробуй ещё раз.', 'wrong');
  }
}

const tutorial = createTutorialController(
  {
    root: tutorialEl,
    progress: tutorialProgress,
    title: tutorialTitle,
    body: tutorialBody,
    tip: tutorialTip,
    pie: tutorialPie,
    quizPrompt,
    quizStage,
    feedback: tutorialFeedback,
    prevBtn: tutorialPrev,
    nextBtn: tutorialNext,
    lessonPane,
    quizPane,
  },
  () => {
    void completeFractionsTutorial(userId)
      .then(() => {
        clearLegacyTutorialFlag(userId);
        unlocked = true;
        tutorial.hide();
        renderGate();
      })
      .catch(() => {
        alert('Не удалось сохранить прохождение обучения. Проверьте backend.');
      });
  },
);

setupLab({
  panel: labPanel,
  pie: labPie,
  frac: labFrac,
  partsInput: labParts,
  partsVal: labPartsVal,
  openBtns: [labOpenBtn, labBtn],
  closeBtn: labCloseBtn,
});

ui.learnBtn.addEventListener('click', () => {
  ui.gateEl.classList.add('hidden');
  tutorial.start();
});

ui.startBtn.addEventListener('click', () => {
  if (!unlocked) return;
  ui.gateEl.classList.add('hidden');
  ui.playEl.classList.remove('hidden');
  void loadProblem();
});

ui.checkBtn.addEventListener('click', () => void onCheck());
ui.nextBtn.addEventListener('click', () => void loadProblem());

async function boot(): Promise<void> {
  const user = await ensureUserLogin();
  userId = user.id;
  userGrade = user.grade ?? null;
  try {
    const status = await fetchFractionsTutorial(userId);
    unlocked = status.done;
    if (!unlocked && hadLegacyTutorialFlag(userId)) {
      await completeFractionsTutorial(userId);
      unlocked = true;
    }
    clearLegacyTutorialFlag(userId);
  } catch {
    unlocked = false;
  }
  try {
    const day = await fetchFractionsSession(userId);
    correctCount = day.correct;
    wrongCount = day.wrong;
    if (day.rankTitle) ui.rankTitleEl.textContent = day.rankTitle;
  } catch {
    /* keep zeros */
  }
  renderGate();
  updateScore();
}

void boot();
