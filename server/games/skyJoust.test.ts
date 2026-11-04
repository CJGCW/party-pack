import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LAVA_Y, LEDGES, LIVES, RESPAWN_MS, RIDER_R, SAFE_MS, TICK_HZ, WORLD_W } from '../../shared/games/skyJoust';
import { flap, fly, newCave } from './skyJoust';

const DT = 1 / TICK_HZ;

/** Runs the cave on from `ms` for `n` ticks; returns the time reached and everyone who went out. */
function run(c: ReturnType<typeof newCave>, ms: number, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    ms += 1000 / TICK_HZ;
    out.push(...fly(c, DT, ms));
  }
  return { ms, out };
}

describe('Sky Joust', () => {
  it('riders stand on their ledges; flapping lifts them, and they land again', () => {
    const c = newCave(['a']);
    const j = c.riders[0];
    const y0 = j.y;
    let { ms } = run(c, 0, 30);
    assert.equal(j.y, y0, 'stays standing');
    flap(j);
    ({ ms } = run(c, ms, 5));
    assert.ok(j.y < y0 - 40, 'went up');
    run(c, ms, 60);
    assert.equal(j.y, y0, 'landed back');
    assert.equal(j.lives, LIVES);
  });

  it('the higher rider in a clash knocks the lower one down; level ones bounce apart', () => {
    const c = newCave(['high', 'low']);
    const [a, b] = c.riders;
    Object.assign(a, { x: 800, y: 600, vx: 0, vy: 0 });
    Object.assign(b, { x: 800, y: 600 + RIDER_R * 1.5, vx: 0, vy: 0 });
    run(c, 10_000, 1);
    assert.equal(a.knocks, 1);
    assert.equal(b.lives, LIVES - 1);
    assert.equal(a.lives, LIVES);

    const d = newCave(['l', 'r']);
    const [l, r] = d.riders;
    Object.assign(l, { x: 790, y: 600, vx: 0, vy: 0 });
    Object.assign(r, { x: 790 + RIDER_R * 1.5, y: 600, vx: 0, vy: 0 });
    run(d, 10_000, 1);
    assert.equal(l.lives + r.lives, LIVES * 2);
    assert.ok(l.vx < 0 && r.vx > 0, 'pushed apart');
  });

  it('lava costs a life; you come back on a ledge, safe for a moment; the last life puts you out', () => {
    const c = newCave(['a', 'b']);
    const [j, other] = c.riders;
    Object.assign(j, { x: 400, y: LAVA_Y - RIDER_R + 5, vy: 200 });
    let { ms, out } = run(c, 0, 1);
    assert.equal(j.lives, LIVES - 1);
    assert.deepEqual(out, []);
    ({ ms } = run(c, ms, Math.ceil((RESPAWN_MS / 1000) * TICK_HZ) + 1));
    assert.ok(LEDGES.some(([left, top, width]) => j.y === top - RIDER_R && j.x > left && j.x < left + width), 'back on a ledge');
    // Safe: a rival landing on them doesn't count.
    Object.assign(other, { x: j.x, y: j.y - RIDER_R * 1.5, vx: 0, vy: 0 });
    ({ ms } = run(c, ms, 1));
    assert.equal(j.lives, LIVES - 1);
    ms += SAFE_MS;
    for (let life = j.lives; life > 0; life--) {
      Object.assign(j, { x: 400, y: LAVA_Y - RIDER_R + 5, vy: 200, returning: false, downUntil: 0 });
      ({ ms, out } = run(c, ms, 1));
    }
    assert.equal(j.lives, 0);
    assert.deepEqual(out, ['a']);
  });

  it('the cave wraps round left to right', () => {
    const c = newCave(['a']);
    const j = c.riders[0];
    Object.assign(j, { x: WORLD_W - 5, y: 120, vx: 400, vy: -400, steer: 1 });
    run(c, 0, 1);
    assert.ok(j.x < 50, `wrapped to ${j.x}`);
  });
});
