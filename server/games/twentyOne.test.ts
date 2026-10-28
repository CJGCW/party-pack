import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TWENTY_ONE_RANKS, handTotal } from '../../shared/games/twentyOne';
import { Deck } from './cards';
import { handPoints } from './twentyOne';

describe('Twenty-One', () => {
  it('counts an ace as 11 when that keeps the hand at 21 or under', () => {
    assert.deepEqual(handTotal(['AS', '9H']), { total: 20, soft: true });
    assert.deepEqual(handTotal(['AS', '9H', '5C']), { total: 15, soft: false });
    assert.deepEqual(handTotal(['AS', 'AH', '9C']), { total: 21, soft: true });
    assert.deepEqual(handTotal(['9S', '9H', '4C']), { total: 22, soft: false });
    assert.deepEqual(handTotal([]), { total: 0, soft: false });
  });

  it('deals only Ace to 9, one deck of 36 per player', () => {
    const shoe = new Deck({ ranks: TWENTY_ONE_RANKS, decks: 3, reshuffleDiscards: false });
    assert.equal(shoe.remaining, 108);
    const cards = shoe.drawMany(108);
    assert.ok(cards.every((c) => c.rank !== 'joker' && TWENTY_ONE_RANKS.includes(c.rank)));
  });

  it('gives the closest hands 1,000, other standing hands 20 a point, and busts nothing', () => {
    assert.equal(handPoints(19, 19), 1000);
    assert.equal(handPoints(17, 19), 340);
    assert.equal(handPoints(23, 19), 0);
  });
});
