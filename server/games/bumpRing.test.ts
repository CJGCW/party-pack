import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BALL_R, CENTER, CRUMBLE_AT_MS, MIN_RADIUS, RADIUS, ROUND_MS, TICK_HZ, radiusAt } from '../../shared/games/bumpRing';
import { newRing, roll } from './bumpRing';

describe('Bump Ring', () => {
  it('starts everyone apart on the platform; the edge crumbles in late on', () => {
    const w = newRing(['a', 'b', 'c', 'd']);
    for (const b of w.balls) assert.ok(Math.hypot(b.x - CENTER, b.y - CENTER) < RADIUS - BALL_R);
    for (let i = 0; i < w.balls.length; i++) for (let j = i + 1; j < w.balls.length; j++) assert.ok(Math.hypot(w.balls[i].x - w.balls[j].x, w.balls[i].y - w.balls[j].y) > BALL_R * 2);
    assert.equal(radiusAt(CRUMBLE_AT_MS), RADIUS);
    assert.equal(radiusAt(ROUND_MS), MIN_RADIUS);
  });

  it('tilting rolls you; rolling off the edge puts you out', () => {
    const w = newRing(['a']);
    w.balls[0].tilt = { x: 1, y: 0 };
    let fell: string[] = [];
    for (let i = 0; i < TICK_HZ * 5 && !fell.length; i++) fell = roll(w, 1 / TICK_HZ, 0);
    assert.deepEqual(fell, ['a']);
  });

  it('ramming someone knocks them back harder than you hit them', () => {
    const w = newRing(['a', 'b']);
    const [a, b] = w.balls;
    Object.assign(a, { x: CENTER - 100, y: CENTER, vx: 500, vy: 0 });
    Object.assign(b, { x: CENTER + BALL_R * 2 - 100 + 2, y: CENTER, vx: 0, vy: 0 });
    for (let i = 0; i < 3; i++) roll(w, 1 / TICK_HZ, 0);
    assert.ok(b.vx > 400, `b moves off at ${b.vx}`);
    assert.ok(a.vx < 100, 'a stops');
  });
});
