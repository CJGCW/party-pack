import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LEVELS } from '../../shared/games/idolTower';
import { knockOut, newTower, woodLeft } from './idolTower';

/** Plays a level through knocking out blocks in this order; returns how it went. */
function play(level: number, order: number[]) {
  const t = newTower(level);
  for (const id of order) {
    const r = knockOut(t, id);
    if (r !== 'ok') return r;
  }
  return 'ok';
}

/** A way to clear the level (an order of wooden blocks), searching every order till one works. */
function solve(level: number): number[] | null {
  const wood = LEVELS[level].blocks.map((b, i) => (b.kind === 'wood' ? i + 1 : 0)).filter(Boolean);
  const search = (done: number[]): number[] | null => {
    for (const id of wood) {
      if (done.includes(id)) continue;
      const order = [...done, id];
      const r = play(level, order);
      if (r === 'cleared') return order;
      if (r === 'ok') {
        const found = search(order);
        if (found) return found;
      }
    }
    return null;
  };
  return search([]);
}

describe('Idol Tower', () => {
  it('every tower stands up by itself, idol off the ground', () => {
    for (let level = 0; level < LEVELS.length; level++) {
      const t = newTower(level);
      const idol = t.blocks.find((b) => b.kind === 'idol')!.body!;
      const start = LEVELS[level].blocks.find((b) => b.kind === 'idol')!;
      assert.ok(Math.abs(idol.getPosition().x - start.x) < 0.05, `${LEVELS[level].name} stays put`);
      assert.ok(idol.getPosition().y > 1, LEVELS[level].name);
    }
  });

  it('every tower can be cleared', () => {
    for (let level = 0; level < LEVELS.length; level++) assert.ok(solve(level), `${LEVELS[level].name} has a way through`);
  });

  it('stone and the idol cannot be tapped; a careless order drops the idol', () => {
    const t = newTower(0);
    assert.equal(knockOut(t, 1), null, 'stone');
    assert.equal(knockOut(t, 6), null, 'idol');
    // The Ledge: knocking the post out first tips the plank, idol and all.
    assert.equal(play(3, [2]), 'fell');
    const ok = newTower(3);
    assert.equal(knockOut(ok, 3), 'ok');
    assert.equal(woodLeft(ok), 2);
  });
});
