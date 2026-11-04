import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OVERLOAD_MS, POINTS, STREAK_BONUS, STREAK_STEP, offBeat } from '../../shared/games/powerBeat';
import { judge, newGenerator } from './powerBeat';

const round = { epoch: 10_000, period: 600 };

describe('Power Beat', () => {
  it('measures how far off the beat a tap is', () => {
    assert.equal(offBeat(10_000, 10_000, 600), 0);
    assert.equal(offBeat(10_620, 10_000, 600), 20);
    assert.equal(offBeat(10_580, 10_000, 600), 20);
    assert.equal(offBeat(10_300, 10_000, 600), 300);
  });

  it('on the beat scores most, near it less, off it a little; a streak adds a bonus', () => {
    const g = newGenerator();
    assert.equal(judge(g, 10_000 + 30, round), 'perfect');
    assert.equal(judge(g, 10_600 + 100, round), 'good');
    assert.equal(judge(g, 11_200 + 300, round), 'off');
    assert.equal(g.power, POINTS.perfect + POINTS.good + POINTS.off);
    const h = newGenerator();
    for (let i = 0; i < STREAK_STEP; i++) judge(h, 22_000 + i * 600, round);
    assert.equal(h.power, STREAK_STEP * POINTS.perfect + STREAK_BONUS);
  });

  it('mashing overloads you for a moment', () => {
    const g = newGenerator();
    let last: string = '';
    for (let i = 0; i < 12; i++) last = judge(g, 30_000 + i * 60, round);
    assert.equal(last, 'overload');
    const before = g.power;
    assert.equal(judge(g, 30_000 + 12 * 60 + 100, round), 'overload');
    assert.equal(g.power, before);
    assert.notEqual(judge(g, 30_000 + 12 * 60 + OVERLOAD_MS + 600, round), 'overload');
  });
});
