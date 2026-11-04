import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FALL_MS, FRUIT_EVERY_MS, GOLD_EVERY, GOLD_POINTS, PLAYER_R, TICK_HZ } from '../../shared/games/fruitRush';
import { newYard, rush } from './fruitRush';

describe('Fruit Rush', () => {
  it('fruit falls in on a steady beat, the same for everyone, some of it golden', () => {
    // Nobody in the yard to pick any up.
    const a = newYard(4, []);
    const b = newYard(4, []);
    rush(a, 0, FRUIT_EVERY_MS * 20);
    rush(b, 0, FRUIT_EVERY_MS * 20);
    assert.deepEqual(a.fruit, b.fruit);
    assert.equal(a.fruit.length, 21);
    assert.ok(a.fruit.some((f) => f.gold));
    assert.equal(a.fruit.filter((f) => f.gold).length, Math.floor(21 / GOLD_EVERY));
  });

  it('rolling over fruit that has landed picks it up; not while it is still falling', () => {
    const y = newYard(1, ['p']);
    rush(y, 0, 0);
    const f = y.fruit[0];
    Object.assign(y.pickers[0], { x: f.x, y: f.y });
    rush(y, 0, 1);
    assert.equal(y.pickers[0].score, 0, 'still falling');
    rush(y, 0, FALL_MS + 1);
    assert.equal(y.pickers[0].score, f.gold ? GOLD_POINTS : 1);
  });

  it('ramming someone hard knocks fruit loose from them (not you)', () => {
    const y = newYard(2, ['rammer', 'target']);
    const [a, b] = y.pickers;
    b.score = 5;
    y.nextDropAt = Infinity;
    Object.assign(a, { x: 400, y: 500, vx: 650, vy: 0 });
    Object.assign(b, { x: 400 + PLAYER_R * 2 + 4, y: 500, vx: 0, vy: 0 });
    for (let i = 0; i < 3; i++) rush(y, 1 / TICK_HZ, 1000);
    assert.equal(b.score, 3);
    assert.equal(a.score, 0);
    assert.equal(y.fruit.length, 2, 'scattered to pick up');
  });
});
