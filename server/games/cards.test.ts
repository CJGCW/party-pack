import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardId, cardLabel, cardName, compareCards, createCards, parseCard, rankValue, sortCards, type Card } from '../../shared/cards';
import { Deck, shuffleCards } from './cards';

/** A repeatable source of random indices, for checking shuffles. */
function seeded(seed: number) {
  let s = seed;
  return (n: number) => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s % n;
  };
}

const ids = (cards: Card[]) => cards.map(cardId);

describe('cards', () => {
  it('makes a standard deck of 52 different cards', () => {
    const cards = createCards();
    assert.equal(cards.length, 52);
    assert.equal(new Set(ids(cards)).size, 52);
  });

  it('adds jokers, more decks and short decks', () => {
    assert.equal(createCards({ jokers: 2 }).length, 54);
    assert.deepEqual(ids(createCards({ jokers: 2 })).slice(-2), ['BJ', 'RJ']);
    assert.equal(createCards({ decks: 6 }).length, 312);
    assert.equal(createCards({ ranks: ['9', '10', 'J', 'Q', 'K', 'A'] }).length, 24);
  });

  it('turns ids into cards and back', () => {
    for (const card of createCards({ jokers: 2 })) assert.equal(cardId(parseCard(cardId(card))!), cardId(card));
    assert.deepEqual(parseCard('ts'), { rank: '10', suit: 'spades' });
    assert.equal(parseCard('1S'), null);
    assert.equal(parseCard('QX'), null);
  });

  it('names and labels cards', () => {
    assert.equal(cardName(parseCard('QH')!), 'Queen of Hearts');
    assert.equal(cardName(parseCard('RJ')!), 'Red Joker');
    assert.equal(cardLabel(parseCard('10S')!).replace('︎', ''), '10♠');
  });

  it('ranks aces high or low', () => {
    const ace = parseCard('AS')!;
    assert.equal(rankValue(ace), 14);
    assert.equal(rankValue(ace, { aceHigh: false }), 1);
    assert.equal(rankValue(parseCard('KD')!), 13);
    assert.equal(rankValue(parseCard('7C')!), 7);
  });

  it('sorts by rank or by suit, with jokers last', () => {
    const hand = ['RJ', 'KH', '2S', 'AH', '2C'].map((id) => parseCard(id)!);
    assert.deepEqual(ids(sortCards(hand)), ['2C', '2S', 'KH', 'AH', 'RJ']);
    assert.deepEqual(ids(sortCards(hand, { by: 'suit' })), ['2C', 'KH', 'AH', '2S', 'RJ']);
    assert.ok(compareCards(parseCard('AS')!, parseCard('2S')!, { aceHigh: false }) < 0);
  });
});

describe('Deck', () => {
  it('shuffles every card exactly once', () => {
    const deck = new Deck({ random: seeded(1) });
    const all = deck.drawMany(60);
    assert.equal(all.length, 52);
    assert.equal(new Set(ids(all)).size, 52);
    assert.notDeepEqual(ids(all), ids(createCards()).reverse(), 'should not come out in new-deck order');
    assert.equal(deck.draw(), null);
  });

  it('shuffles the same way for the same seed', () => {
    assert.deepEqual(ids(shuffleCards(createCards(), seeded(7))), ids(shuffleCards(createCards(), seeded(7))));
  });

  it('deals round the table', () => {
    const deck = new Deck({ random: seeded(2) });
    const top = deck.peek(6);
    const hands = deck.deal(3, 2);
    assert.deepEqual(hands.map(ids), [
      [cardId(top[0]), cardId(top[3])],
      [cardId(top[1]), cardId(top[4])],
      [cardId(top[2]), cardId(top[5])],
    ]);
    assert.equal(deck.remaining, 46);
  });

  it('reshuffles the discards when the deck runs out', () => {
    const deck = new Deck({ random: seeded(3) });
    const first = deck.drawMany(52);
    deck.discard(...first.slice(0, 10));
    assert.equal(deck.drawMany(20).length, 10);
    assert.equal(deck.discarded, 0);
  });

  it('can keep the top discard face up when reshuffling', () => {
    const deck = new Deck({ random: seeded(4), keepTopDiscard: true });
    const drawn = deck.drawMany(52);
    deck.discard(...drawn.slice(0, 5));
    const top = deck.topDiscard!;
    assert.equal(deck.drawMany(10).length, 4);
    assert.equal(cardId(deck.topDiscard!), cardId(top));
  });

  it('stops when told not to reshuffle', () => {
    const deck = new Deck({ random: seeded(5), reshuffleDiscards: false });
    const drawn = deck.drawMany(52);
    deck.discard(...drawn);
    assert.equal(deck.draw(), null);
    assert.equal(cardId(deck.takeDiscard()!), cardId(drawn.at(-1)!));
    assert.equal(deck.discarded, 51);
  });

  it('puts cards back on top, at the bottom, or anywhere', () => {
    const deck = new Deck({ random: seeded(6) });
    const [a, b] = deck.drawMany(2);
    deck.putBack([a], 'top');
    assert.equal(cardId(deck.peek()[0]), cardId(a));
    deck.putBack([b], 'bottom');
    assert.equal(cardId(deck.peek(52).at(-1)!), cardId(b));
    assert.equal(deck.remaining, 52);
  });
});
