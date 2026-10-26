// A standard deck of playing cards, shared by the server (dealing) and the screens (drawing).
// Shuffling and dealing live in server/games/cards.ts, so the order never leaves the server.

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface SuitedCard {
  rank: Rank;
  suit: Suit;
}

export interface Joker {
  rank: 'joker';
  /** Decks usually have one of each. */
  color: 'red' | 'black';
}

export type Card = SuitedCard | Joker;

/** In bridge order (lowest first), which is also the order of a new deck. */
export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
/** Ace first, as in a new deck. */
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** U+FE0E asks for the text glyph, so phones don't swap in a red heart emoji. */
export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠︎',
  hearts: '♥︎',
  diamonds: '♦︎',
  clubs: '♣︎',
};

const RANK_NAMES: Record<Rank, string> = {
  A: 'Ace', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
  '8': 'Eight', '9': 'Nine', '10': 'Ten', J: 'Jack', Q: 'Queen', K: 'King',
};

const SUIT_LETTERS: Record<Suit, string> = { spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C' };

export const isJoker = (card: Card): card is Joker => card.rank === 'joker';

export function isRed(card: Card) {
  return isJoker(card) ? card.color === 'red' : card.suit === 'hearts' || card.suit === 'diamonds';
}

export const isFaceCard = (card: Card) => card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';

/** A short id, handy as a key and on the wire: "AS", "10H", "QD"; jokers are "RJ" and "BJ". */
export function cardId(card: Card): string {
  if (isJoker(card)) return card.color === 'red' ? 'RJ' : 'BJ';
  return card.rank + SUIT_LETTERS[card.suit];
}

/** The card for an id from `cardId` (case-insensitive; "T" works for ten), or null if it isn't one. */
export function parseCard(id: string): Card | null {
  const text = id.trim().toUpperCase();
  if (text === 'RJ' || text === 'BJ') return { rank: 'joker', color: text === 'RJ' ? 'red' : 'black' };
  const match = /^(10|T|[2-9AJQK])([SHDC])$/.exec(text);
  if (!match) return null;
  const rank = (match[1] === 'T' ? '10' : match[1]) as Rank;
  const suit = SUITS.find((s) => SUIT_LETTERS[s] === match[2])!;
  return { rank, suit };
}

export const sameCard = (a: Card, b: Card) => cardId(a) === cardId(b);

/** "Queen of Hearts", "Red Joker". */
export function cardName(card: Card) {
  if (isJoker(card)) return card.color === 'red' ? 'Red Joker' : 'Black Joker';
  return `${RANK_NAMES[card.rank]} of ${card.suit[0].toUpperCase()}${card.suit.slice(1)}`;
}

/** A short label: "Q♥", "10♠"; jokers are "JKR". */
export function cardLabel(card: Card) {
  return isJoker(card) ? 'JKR' : `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export interface RankOptions {
  /** Ace counts as 14 (above the King) unless this is false, when it's 1. */
  aceHigh?: boolean;
}

/** 2–10 at face value, J 11, Q 12, K 13, A 14 (or 1); jokers 0 (or set your own rule per game). */
export function rankValue(card: Card, { aceHigh = true }: RankOptions = {}) {
  if (isJoker(card)) return 0;
  if (card.rank === 'A') return aceHigh ? 14 : 1;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return 13;
  return Number(card.rank);
}

/**
 * For sorting hands: by rank then suit, or by suit then rank (how most people hold their
 * cards). Jokers go last.
 */
export function compareCards(a: Card, b: Card, { by = 'rank', aceHigh = true }: RankOptions & { by?: 'rank' | 'suit' } = {}) {
  if (isJoker(a) || isJoker(b)) {
    if (!isJoker(a)) return -1;
    if (!isJoker(b)) return 1;
    return a.color.localeCompare(b.color);
  }
  const rank = rankValue(a, { aceHigh }) - rankValue(b, { aceHigh });
  const suit = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  return by === 'rank' ? rank || suit : suit || rank;
}

export function sortCards(cards: readonly Card[], options: RankOptions & { by?: 'rank' | 'suit' } = {}) {
  return [...cards].sort((a, b) => compareCards(a, b, options));
}

export interface DeckOptions {
  /** How many standard decks shuffled together (e.g. 6 for a blackjack shoe). */
  decks?: number;
  /** Jokers per deck: 0 (default), 1 (black) or 2 (black and red). */
  jokers?: 0 | 1 | 2;
  /** Only these ranks, for short decks (e.g. 9 to A for euchre). */
  ranks?: readonly Rank[];
}

/** Every card, in new-deck order (unshuffled). */
export function createCards({ decks = 1, jokers = 0, ranks = RANKS }: DeckOptions = {}): Card[] {
  const one: Card[] = SUITS.flatMap((suit) => ranks.map((rank): Card => ({ rank, suit })));
  if (jokers >= 1) one.push({ rank: 'joker', color: 'black' });
  if (jokers >= 2) one.push({ rank: 'joker', color: 'red' });
  return Array.from({ length: Math.max(1, decks) }, () => one.map((c) => ({ ...c }))).flat();
}
