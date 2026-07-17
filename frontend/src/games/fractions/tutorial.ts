import { fracDisplayHtml, fracInputsHtml } from './fraction-ui';
import { countSelected, renderPie } from './pie';

const LEGACY_KEY_PREFIX = 'fractions_tutorial_done_';

export function clearLegacyTutorialFlag(userId: number): void {
  localStorage.removeItem(`${LEGACY_KEY_PREFIX}${userId}`);
}

export function hadLegacyTutorialFlag(userId: number): boolean {
  return localStorage.getItem(`${LEGACY_KEY_PREFIX}${userId}`) === '1';
}

export interface LessonStep {
  id: string;
  title: string;
  body: string;
  tip: string;
  pieParts: number;
  pieTake: number;
}

export const LESSONS: LessonStep[] = [
  {
    id: 'equal',
    title: 'Равные части',
    body: 'Дробь появляется, когда целое делят на равные куски. Пирог, шоколадка, яблоко — неважно: части должны быть одинаковыми, иначе деление несправедливое.',
    tip: 'Сначала видим доли глазами, и только потом пишем цифры.',
    pieParts: 2,
    pieTake: 0,
  },
  {
    id: 'half',
    title: 'Половина',
    body: 'Если целое разрезали на 2 равные части и взяли одну — это половина. Запись: 1/2. Нижняя цифра — на сколько разрезали, верхняя — сколько взяли.',
    tip: 'Знаменатель (снизу) = «на сколько частей». Числитель (сверху) = «сколько взяли».',
    pieParts: 2,
    pieTake: 1,
  },
  {
    id: 'quarter',
    title: 'Четверть',
    body: 'Разрезали на 4 равные части и взяли одну — это четверть, 1/4. Взяли три кусочка из четырёх — уже 3/4.',
    tip: 'Чем больше знаменатель при одном кусочке, тем меньше доля: 1/8 меньше, чем 1/4.',
    pieParts: 4,
    pieTake: 1,
  },
  {
    id: 'write',
    title: 'Как записывают дробь',
    body: 'Пиццу разрезали на 6 частей, отметили 2. Это дробь 2/6. Её можно упростить до 1/3 — те же доли, другая запись. Смысл доли не меняется.',
    tip: 'Дробь — это не «две цифры», а ответ на вопрос: какую часть целого мы взяли?',
    pieParts: 6,
    pieTake: 2,
  },
];

export type QuizKind = 'pick-half' | 'write-frac' | 'compare';

export interface QuizItem {
  id: string;
  kind: QuizKind;
  prompt: string;
  parts?: number;
  take?: number;
  aLabel?: string;
  bLabel?: string;
  answer: number | string | { num: number; den: number };
}

export const QUIZ: QuizItem[] = [
  {
    id: 'q1',
    kind: 'pick-half',
    prompt: 'Отметь половину пирога (ровно одну из двух равных частей).',
    parts: 2,
    answer: 1,
  },
  {
    id: 'q2',
    kind: 'write-frac',
    prompt: 'Пиццу разрезали на 4 равные части. Отметили 3 кусочка. Запиши дробь.',
    parts: 4,
    take: 3,
    answer: { num: 3, den: 4 },
  },
  {
    id: 'q3',
    kind: 'compare',
    prompt: 'Какая доля больше: 1/4 или 3/4?',
    aLabel: fracDisplayHtml(1, 4),
    bLabel: fracDisplayHtml(3, 4),
    answer: 'b',
  },
];

export const QUIZ_PASS_SCORE = QUIZ.length;

export interface TutorialUI {
  root: HTMLElement;
  progress: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  tip: HTMLElement;
  pie: HTMLElement;
  quizPrompt: HTMLElement;
  quizStage: HTMLElement;
  feedback: HTMLElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  lessonPane: HTMLElement;
  quizPane: HTMLElement;
}

export function createTutorialController(
  ui: TutorialUI,
  onUnlocked: () => void,
): { start: () => void; show: () => void; hide: () => void } {
  let step = 0;
  let mode: 'lesson' | 'quiz' = 'lesson';
  let quizIndex = 0;
  let quizScore = 0;
  let pieSelected: boolean[] = [];
  let comparePick: 'a' | 'b' | null = null;
  let quizLocked = false;

  const show = (): void => ui.root.classList.remove('hidden');
  const hide = (): void => ui.root.classList.add('hidden');

  function setFeedback(text: string, type: 'correct' | 'wrong' | 'hint' | ''): void {
    if (!text) {
      ui.feedback.className = 'feedback hidden';
      ui.feedback.textContent = '';
      return;
    }
    ui.feedback.textContent = text;
    ui.feedback.className = `feedback ${type}`;
  }

  function renderLesson(): void {
    mode = 'lesson';
    ui.lessonPane.classList.remove('hidden');
    ui.quizPane.classList.add('hidden');
    const lesson = LESSONS[step]!;
    ui.progress.textContent = `Урок ${step + 1} из ${LESSONS.length}`;
    ui.title.textContent = lesson.title;
    ui.body.textContent = lesson.body;
    ui.tip.textContent = lesson.tip;
    renderPie(ui.pie, { parts: lesson.pieParts, take: lesson.pieTake, size: 200 });
    ui.prevBtn.classList.toggle('hidden', step === 0);
    ui.nextBtn.textContent = step === LESSONS.length - 1 ? 'К мини-тесту' : 'Дальше';
    ui.nextBtn.disabled = false;
    setFeedback('', '');
  }

  function renderQuiz(): void {
    mode = 'quiz';
    quizLocked = false;
    comparePick = null;
    ui.lessonPane.classList.add('hidden');
    ui.quizPane.classList.remove('hidden');
    const q = QUIZ[quizIndex]!;
    ui.progress.textContent = `Мини-тест: вопрос ${quizIndex + 1} из ${QUIZ.length}`;
    ui.quizPrompt.textContent = q.prompt;
    ui.prevBtn.classList.add('hidden');
    ui.nextBtn.textContent = 'Проверить ответ';
    ui.nextBtn.disabled = false;
    setFeedback('', '');

    if (q.kind === 'pick-half') {
      const parts = q.parts ?? 2;
      pieSelected = Array.from({ length: parts }, () => false);
      ui.quizStage.innerHTML = `<div id="quiz-pie"></div><p class="odz-warn">Кликни нужные кусочки.</p>`;
      const canvas = ui.quizStage.querySelector<HTMLElement>('#quiz-pie')!;
      renderPie(canvas, {
        parts,
        selected: pieSelected,
        interactive: true,
        size: 200,
        onToggle: (_i, next) => {
          pieSelected = next;
        },
      });
      return;
    }

    if (q.kind === 'write-frac') {
      ui.quizStage.innerHTML = `
        <div id="quiz-pie"></div>
        ${fracInputsHtml('quiz-num', 'quiz-den')}
      `;
      renderPie(ui.quizStage.querySelector<HTMLElement>('#quiz-pie')!, {
        parts: q.parts ?? 4,
        take: q.take ?? 0,
        size: 180,
      });
      return;
    }

    ui.quizStage.innerHTML = `
      <div class="compare-btns">
        <button type="button" class="action-btn" data-pick="a">${q.aLabel ?? 'A'}</button>
        <button type="button" class="action-btn" data-pick="b">${q.bLabel ?? 'B'}</button>
      </div>
    `;
    ui.quizStage.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (quizLocked) return;
        comparePick = btn.dataset.pick === 'b' ? 'b' : 'a';
        ui.quizStage.querySelectorAll('[data-pick]').forEach(b => b.classList.remove('is-picked'));
        btn.classList.add('is-picked');
      });
    });
  }

  function checkQuizAnswer(): boolean {
    const q = QUIZ[quizIndex]!;
    if (q.kind === 'pick-half') {
      return countSelected(pieSelected) === q.answer;
    }
    if (q.kind === 'write-frac') {
      const want = q.answer as { num: number; den: number };
      const n = Number(ui.quizStage.querySelector<HTMLInputElement>('#quiz-num')?.value);
      const d = Number(ui.quizStage.querySelector<HTMLInputElement>('#quiz-den')?.value);
      return n === want.num && d === want.den;
    }
    return comparePick === q.answer;
  }

  function onNext(): void {
    if (mode === 'lesson') {
      if (step < LESSONS.length - 1) {
        step += 1;
        renderLesson();
        return;
      }
      quizIndex = 0;
      quizScore = 0;
      renderQuiz();
      return;
    }

    if (quizLocked) {
      if (quizIndex >= QUIZ.length - 1) {
        if (quizScore >= QUIZ_PASS_SCORE) {
          onUnlocked();
          return;
        }
        step = 0;
        renderLesson();
        setFeedback('Нужно ответить верно на все вопросы. Пройди уроки ещё раз.', 'hint');
        return;
      }
      quizIndex += 1;
      renderQuiz();
      return;
    }

    const ok = checkQuizAnswer();
    if (!ok && QUIZ[quizIndex]?.kind === 'compare' && comparePick === null) {
      setFeedback('Сначала выбери ответ.', 'hint');
      return;
    }
    if (!ok && QUIZ[quizIndex]?.kind === 'write-frac') {
      const n = ui.quizStage.querySelector<HTMLInputElement>('#quiz-num')?.value;
      const d = ui.quizStage.querySelector<HTMLInputElement>('#quiz-den')?.value;
      if (!n || !d) {
        setFeedback('Запиши числитель и знаменатель.', 'hint');
        return;
      }
    }
    if (!ok && QUIZ[quizIndex]?.kind === 'pick-half' && countSelected(pieSelected) === 0) {
      setFeedback('Отметь кусочки на пироге.', 'hint');
      return;
    }

    quizLocked = true;
    if (ok) {
      quizScore += 1;
      setFeedback('Верно!', 'correct');
    } else {
      setFeedback('Пока неверно. Запомни и иди дальше — в конце можно пересдать.', 'wrong');
    }

    if (quizIndex >= QUIZ.length - 1) {
      ui.nextBtn.textContent = quizScore >= QUIZ_PASS_SCORE
        ? 'Открыть «Деление и дроби»'
        : 'Повторить обучение';
    } else {
      ui.nextBtn.textContent = 'Следующий вопрос';
    }
  }

  function onPrev(): void {
    if (mode !== 'lesson' || step === 0) return;
    step -= 1;
    renderLesson();
  }

  ui.nextBtn.addEventListener('click', onNext);
  ui.prevBtn.addEventListener('click', onPrev);

  return {
    start: () => {
      step = 0;
      quizIndex = 0;
      quizScore = 0;
      show();
      renderLesson();
    },
    show,
    hide,
  };
}
