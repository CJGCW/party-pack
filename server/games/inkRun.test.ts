import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INK, INK_LEVELS } from '../../shared/games/inkRun';
import { draw, newInk, restart, run } from './inkRun';

/** A stroke that solves each level. */
const SOLUTIONS: [number, number][][] = [
  [
    [3.1, 2.8],
    [6.9, 2.8],
  ],
  [
    [3.8, 0.15],
    [4.55, 1.3],
  ],
  [
    [3.9, 0.15],
    [6.98, 1.2],
  ],
];

describe('Ink Run', () => {
  it('no level can be done without drawing; each can with the right stroke', () => {
    for (let level = 0; level < INK_LEVELS.length; level++) {
      assert.equal(run(newInk(level)), false, `${INK_LEVELS[level].name} needs drawing`);
      const ink = newInk(level);
      assert.ok(draw(ink, SOLUTIONS[level]), ink.refused);
      assert.ok(run(ink), `${INK_LEVELS[level].name} solved`);
      assert.ok(ink.solved);
    }
  });

  it('strokes through the ground or the ball are refused; ink runs out', () => {
    const ink = newInk(0);
    assert.equal(draw(ink, [[1, 1], [2, 1]]), false);
    assert.match(ink.refused, /ground/);
    const ball = INK_LEVELS[0].ball;
    assert.equal(draw(ink, [[ball.x - 0.5, ball.y], [ball.x + 0.5, ball.y]]), false);
    assert.match(ink.refused, /ball/);
    assert.equal(draw(ink, [[0.2, 5.5], [9.8, 5.5]]), false, 'too long for the ink');
    assert.match(ink.refused, /ink/);
    assert.ok(draw(ink, [[4, 5], [6, 5]]));
    assert.ok(ink.inkLeft < INK);
  });

  it('a retry keeps the strokes; a clear gives the ink back', () => {
    const ink = newInk(0);
    draw(ink, SOLUTIONS[0]);
    restart(ink, true);
    assert.equal(ink.strokes.length, 1);
    assert.ok(run(ink), 'still solves it');
    restart(ink, false);
    assert.equal(ink.strokes.length, 0);
    assert.equal(ink.inkLeft, INK);
  });
});
