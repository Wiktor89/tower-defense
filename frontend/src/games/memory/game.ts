const SYMBOLS = ['🐶', '🐱', '🐭', '🦊', '🐻', '🐼', '🐸', '🦁'] as const;

export type MemoryCard = {
  id: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export type MemoryCallbacks = {
  onPair: (matched: number, total: number) => void;
  onComplete: () => void;
};

export class MemoryGame {
  private cards: MemoryCard[] = [];
  private open: number[] = [];
  private locked = false;
  private matchedCount = 0;
  private readonly totalPairs = SYMBOLS.length;
  private readonly grid: HTMLElement;
  private readonly callbacks: MemoryCallbacks;
  private mismatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(grid: HTMLElement, callbacks: MemoryCallbacks) {
    this.grid = grid;
    this.callbacks = callbacks;
  }

  get pairsFound(): number {
    return this.matchedCount;
  }

  get pairsTotal(): number {
    return this.totalPairs;
  }

  reset(): void {
    if (this.mismatchTimer) {
      clearTimeout(this.mismatchTimer);
      this.mismatchTimer = null;
    }
    this.locked = false;
    this.open = [];
    this.matchedCount = 0;
    const pair = SYMBOLS.flatMap((symbol, i) => [
      { id: i * 2, symbol, flipped: false, matched: false },
      { id: i * 2 + 1, symbol, flipped: false, matched: false },
    ]);
    this.cards = shuffle(pair);
    this.render();
  }

  private render(): void {
    this.grid.innerHTML = '';
    this.cards.forEach((card, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card';
      if (card.flipped || card.matched) btn.classList.add('is-flipped');
      if (card.matched) btn.classList.add('is-matched');
      btn.disabled = card.matched || this.locked;
      btn.setAttribute('aria-label', card.flipped || card.matched ? card.symbol : 'закрытая карточка');
      btn.innerHTML = `
        <span class="card-inner">
          <span class="card-face card-back">?</span>
          <span class="card-face card-front">${card.symbol}</span>
        </span>
      `;
      btn.addEventListener('click', () => this.flip(index));
      this.grid.appendChild(btn);
    });
  }

  private flip(index: number): void {
    if (this.locked) return;
    const card = this.cards[index];
    if (!card || card.flipped || card.matched) return;
    if (this.open.includes(index)) return;

    card.flipped = true;
    this.open.push(index);
    this.render();

    if (this.open.length < 2) return;

    const [a, b] = this.open;
    const first = this.cards[a!];
    const second = this.cards[b!];
    if (!first || !second) return;

    this.locked = true;
    if (first.symbol === second.symbol) {
      first.matched = true;
      second.matched = true;
      this.matchedCount += 1;
      this.open = [];
      this.locked = false;
      this.render();
      this.callbacks.onPair(this.matchedCount, this.totalPairs);
      if (this.matchedCount >= this.totalPairs) {
        this.callbacks.onComplete();
      }
      return;
    }

    this.mismatchTimer = setTimeout(() => {
      first.flipped = false;
      second.flipped = false;
      this.open = [];
      this.locked = false;
      this.mismatchTimer = null;
      this.render();
    }, 700);
  }
}
