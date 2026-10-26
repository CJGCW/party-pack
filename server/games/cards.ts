import { randomInt } from 'node:crypto';
import { createCards, type Card, type DeckOptions } from '../../shared/cards';

/** A random whole number from 0 up to (not including) `n`. */
export type RandomIndex = (n: number) => number;

/** Cryptographically random, so nobody can work out the order from earlier deals. */
const cryptoIndex: RandomIndex = (n) => randomInt(n);

/** Fisher–Yates, in place. */
export function shuffleCards<T>(items: T[], random: RandomIndex = cryptoIndex): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export interface ShuffledDeckOptions extends DeckOptions {
  /** Start from these cards instead (e.g. a custom deck); they're copied, then shuffled. */
  cards?: readonly Card[];
  /** When the deck runs out, shuffle the discard pile back in and keep drawing. Default true. */
  reshuffleDiscards?: boolean;
  /** When reshuffling the discards, leave the top one face up (crazy eights, rummy). Default false. */
  keepTopDiscard?: boolean;
  /** For tests and replays: a seeded source of random indices. */
  random?: RandomIndex;
}

/**
 * A shuffled draw pile with a discard pile. Keep it on the server: send players only the cards
 * they're allowed to see.
 */
export class Deck {
  private pile: Card[];
  private discards: Card[] = [];
  private readonly random: RandomIndex;
  private readonly reshuffle: boolean;
  private readonly keepTop: boolean;

  constructor(options: ShuffledDeckOptions = {}) {
    this.random = options.random ?? cryptoIndex;
    this.reshuffle = options.reshuffleDiscards ?? true;
    this.keepTop = options.keepTopDiscard ?? false;
    this.pile = options.cards ? options.cards.map((c) => ({ ...c })) : createCards(options);
    this.shuffle();
  }

  /** Cards left to draw. */
  get remaining() {
    return this.pile.length;
  }

  /** Cards on the discard pile. */
  get discarded() {
    return this.discards.length;
  }

  /** The top of the discard pile (for games like crazy eights), or null. */
  get topDiscard(): Card | null {
    return this.discards.at(-1) ?? null;
  }

  /** Shuffles what's left in the draw pile. */
  shuffle() {
    shuffleCards(this.pile, this.random);
    return this;
  }

  /** The top card, or null if there's none (even after reshuffling the discards, when on). */
  draw(): Card | null {
    if (this.pile.length === 0) this.refill();
    return this.pile.pop() ?? null;
  }

  /** Up to `n` cards from the top (fewer only if the deck and discards run out). */
  drawMany(n: number): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < n; i++) {
      const card = this.draw();
      if (!card) break;
      cards.push(card);
    }
    return cards;
  }

  /** Deals `each` cards to `hands` hands one at a time around the table, like a real deal. */
  deal(hands: number, each: number): Card[][] {
    const dealt: Card[][] = Array.from({ length: hands }, () => []);
    for (let round = 0; round < each; round++) {
      for (const hand of dealt) {
        const card = this.draw();
        if (card) hand.push(card);
      }
    }
    return dealt;
  }

  /** The top `n` cards without drawing them (top card first). */
  peek(n = 1): Card[] {
    return this.pile.slice(-n).reverse();
  }

  discard(...cards: Card[]) {
    this.discards.push(...cards);
  }

  /** Takes the top discard back (e.g. picking up from the discard pile in rummy). */
  takeDiscard(): Card | null {
    return this.discards.pop() ?? null;
  }

  /** Puts cards back into the draw pile: on top, at the bottom, or anywhere at random. */
  putBack(cards: Card[], where: 'top' | 'bottom' | 'random' = 'random') {
    for (const card of cards) {
      if (where === 'top') this.pile.push(card);
      else if (where === 'bottom') this.pile.unshift(card);
      else this.pile.splice(this.random(this.pile.length + 1), 0, card);
    }
  }

  /** Shuffles the discards back into the draw pile (leaving the top one, with keepTopDiscard). */
  reshuffleDiscards() {
    const top = this.keepTop ? this.discards.pop() : undefined;
    this.pile.push(...this.discards);
    this.discards = top ? [top] : [];
    this.shuffle();
  }

  private refill() {
    if (this.reshuffle && this.discards.length > 0) this.reshuffleDiscards();
  }
}
