import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HEARTS, ROUND_MS, rocksFor } from '../../shared/games/rockSolid';
import { hold, isHard, newBlob, stepBlob } from './rockSolid';

describe('Rock Solid', () => {
  it('everyone gets the same rocks, coming faster as the round goes on', () => {
    const rocks = rocksFor(42);
    assert.deepEqual(rocks, rocksFor(42));
    const early = rocks.filter((r) => r.at < 20_000).length;
    const late = rocks.filter((r) => r.at > ROUND_MS - 20_000).length;
    assert.ok(late > early * 1.5, `${early} early, ${late} late`);
  });

  it('a rock bounces off a hard blob and costs a soft one a heart', () => {
    const b = newBlob(1);
    const first = b.rocks[0].at;
    hold(b, true);
    stepBlob(b, 0.05, first);
    assert.equal(b.blocked, 1);
    hold(b, false);
    stepBlob(b, 0.05, b.rocks[1].at);
    assert.equal(b.hearts, HEARTS - 1);
  });

  it('holding uses up energy: hold too long and you go soft until you let go', () => {
    const b = newBlob(1);
    hold(b, true);
    for (let i = 0; i < 60; i++) stepBlob(b, 0.05, 10);
    assert.equal(isHard(b), false, 'spent');
    stepBlob(b, 0.5, 10);
    assert.equal(isHard(b), false, 'still spent while held');
    hold(b, false);
    stepBlob(b, 0.5, 10);
    hold(b, true);
    assert.ok(isHard(b), 'hard again after letting go');
  });

  it('never hardening loses every heart early on', () => {
    const b = newBlob(3);
    let ms = 0;
    while (!stepBlob(b, 0.05, (ms += 50))) {}
    assert.ok(ms < 12_000);
  });
});
