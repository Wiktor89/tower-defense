const LEVEL_RANGES = {
  1: { min: 1, max: 9 },
  2: { min: 10, max: 99 },
  3: { min: 100, max: 999 },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOp(mode) {
  if (mode === 'add') return '+';
  if (mode === 'sub') return '−';
  return Math.random() < 0.5 ? '+' : '−';
}

export function generateProblem(level, opMode) {
  const range = LEVEL_RANGES[level];
  const op = pickOp(opMode);

  let a, b, answer;

  if (op === '+') {
    a = randInt(range.min, range.max);
    b = randInt(range.min, range.max);
    answer = a + b;
  } else {
    a = randInt(range.min, range.max);
    b = randInt(range.min, a);
    answer = a - b;
  }

  const width = Math.max(
    String(a).length,
    String(b).length,
    String(answer).length
  );

  return { a, b, op, answer, width };
}

export function padNumber(num, width) {
  return String(num).padStart(width, ' ');
}

export function splitDigits(num, width) {
  return padNumber(num, width).split('');
}
