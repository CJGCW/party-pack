import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARENA_R, BALL_TIMES, BRICK_RINGS, BRICKS_PER_RING, CENTER, SHIELD_R, TICK_HZ, keepCenter } from '../../shared/games/keepGuard';
import { aim, bricksLeft, newArena, play, speedAt, type Arena } from './keepGuard';
import { CATCH_HOLD_MS } from '../../shared/games/keepGuard';

const DT = 1 / TICK_HZ;

/** Sends a ball straight at keep `i` from the middle (and stops any more coming in). */
function shootAt(a: Arena, i: number) {
  const k = a.keeps[i];
  const d = Math.hypot(k.x - CENTER, k.y - CENTER);
  a.balls = [{ id: 1, x: CENTER, y: CENTER, vx: (k.x - CENTER) / d, vy: (k.y - CENTER) / d }];
  a.launched = BALL_TIMES.length;
}

function run(a: Arena, ticks: number, ms = 1000) {
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) out.push(...play(a, DT, ms));
  return out;
}

describe('Keep Guard', () => {
  it('holding CATCH catches a ball on the shield; letting go fires it the way the shield points, hot', () => {
    const a = newArena(1, ['a', 'b']);
    shootAt(a, 0);
    a.keeps[0].catching = true;
    run(a, 60);
    const k = a.keeps[0];
    const b = a.balls[0];
    assert.equal(k.held, b, 'caught');
    const at = { x: b.x, y: b.y };
    run(a, 10);
    assert.deepEqual({ x: b.x, y: b.y }, at, 'it stays put');
    k.catching = false;
    run(a, 1);
    assert.equal(k.held, null);
    assert.ok(b.hot);
    assert.ok(b.vx > 0, 'off toward the far side');
  });

  it('a caught ball can only be held so long', () => {
    const a = newArena(1, ['a', 'b']);
    shootAt(a, 0);
    a.keeps[0].catching = true;
    run(a, 60, 1000);
    run(a, 2, 1000 + CATCH_HOLD_MS + 1);
    assert.equal(a.keeps[0].held, null);
    assert.equal(a.keeps[0].catching, false, 'and you have to press again');
  });

  it('a hot ball takes the bricks behind the first; a fallen keep sends in another ball', () => {
    const a = newArena(1, ['a', 'b']);
    aim(a.keeps[0], 1);
    aim(a.keeps[1], 1);
    shootAt(a, 0);
    a.balls[0].hot = true;
    run(a, 40);
    assert.equal(bricksLeft(a.keeps[0]), BRICK_RINGS.length * BRICKS_PER_RING - BRICK_RINGS.length);
    a.keeps[0].bricks = a.keeps[0].bricks.map((ring) => ring.map(() => false));
    shootAt(a, 0);
    run(a, 60);
    assert.equal(a.keeps[0].alive, false);
    assert.equal(a.balls.length, 2);
  });

  it('keeps sit evenly round the rim; two face each other', () => {
    const left = keepCenter(0, 2);
    const right = keepCenter(1, 2);
    assert.ok(Math.abs(left.x - (CENTER - ARENA_R)) < 1e-6 && Math.abs(left.y - CENTER) < 1e-6);
    assert.ok(Math.abs(right.x - (CENTER + ARENA_R)) < 1e-6 && Math.abs(right.y - CENTER) < 1e-6);
  });

  it('a shield in the way bats the ball back', () => {
    const a = newArena(1, ['a', 'b']);
    shootAt(a, 0);
    const out = run(a, 60);
    assert.deepEqual(out, []);
    assert.equal(bricksLeft(a.keeps[0]), BRICK_RINGS.length * BRICKS_PER_RING);
    assert.ok(a.balls[0].x > a.keeps[0].x + SHIELD_R, 'kept out');
  });

  it('with the shield swung away, the ball breaks bricks, and in the end gets through to the keep', () => {
    const a = newArena(1, ['a', 'b']);
    aim(a.keeps[0], 1);
    aim(a.keeps[1], 1);
    shootAt(a, 0);
    run(a, 60);
    assert.ok(bricksLeft(a.keeps[0]) < BRICK_RINGS.length * BRICKS_PER_RING, 'broke a brick');
    // Clear its wall: straight at the keep now.
    a.keeps[0].bricks = a.keeps[0].bricks.map((ring) => ring.map(() => false));
    shootAt(a, 0);
    const out = run(a, 60);
    assert.deepEqual(out, ['a']);
    assert.equal(a.keeps[0].alive, false);
  });

  it('balls come in over time and speed up', () => {
    const a = newArena(3, ['a', 'b', 'c']);
    play(a, DT, 0);
    assert.equal(a.balls.length, 1);
    play(a, DT, BALL_TIMES[1]);
    assert.equal(a.balls.length, 2);
    assert.ok(speedAt(60_000) > speedAt(0));
    // Nothing gets out of the arena.
    for (let t = 0; t < 30 * TICK_HZ; t++) play(a, DT, BALL_TIMES[1] + t * 33);
    for (const b of a.balls) assert.ok(Math.hypot(b.x - CENTER, b.y - CENTER) <= ARENA_R + 1);
  });
});
