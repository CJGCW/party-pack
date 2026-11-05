import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHECKPOINT_EVERY, RESPAWN_MS, RING_GAP, ROUND_MS, SEGMENTS, SMASH_AFTER, TICK_HZ, ringAt, sliceUnderBall } from '../../shared/games/helixDrop';
import { dropOn, newTower, type Tower } from './helixDrop';

/** The tower angle that puts slice `k` under the ball. */
const facing = (k: number) => -(((k + 0.5) / SEGMENTS) * Math.PI * 2);

/** A careful player: tries each slice and keeps the turn that gets deepest over the next second without landing on red. */
function plan(t: Tower, ms: number) {
  let best = t.target;
  let bestScore = -Infinity;
  for (let k = 0; k < SEGMENTS; k++) {
    const sim = { ...t, target: facing(k) };
    let red = false;
    for (let i = 0; i < TICK_HZ * 1.2 && !red; i++) {
      dropOn(sim, 1 / TICK_HZ, ms + (i * 1000) / TICK_HZ);
      red = sim.respawnAt !== null;
    }
    const score = (red ? -1000 : 0) + sim.deepest * 10 + sim.depth / 100;
    if (score > bestScore) [best, bestScore] = [facing(k), score];
  }
  return best;
}

describe('Helix Drop', () => {
  it('falling through three rings without a bounce sets the ball on fire, and it smashes the next ring, red or not', () => {
    const t = newTower(5);
    for (let n = 1; n < 40; n++) {
      if (n % CHECKPOINT_EVERY === 0) continue;
      const below = ringAt(5, n);
      const red = below.findIndex((s) => s === 'danger');
      if (red < 0) continue;
      Object.assign(t, { depth: n * RING_GAP - 5, vy: 1000, streak: SMASH_AFTER, angle: -((red + 0.5) / SEGMENTS) * Math.PI * 2, target: -((red + 0.5) / SEGMENTS) * Math.PI * 2, respawnAt: null });
      dropOn(t, 0.05, 0);
      assert.equal(t.respawnAt, null, 'through the red');
      assert.equal(t.streak, 0);
      assert.equal(t.deepest, n + 1);
      return;
    }
    assert.fail('no red found');
  });

  it('a bounce puts the fire out', () => {
    const t = newTower(5);
    const solid = ringAt(5, 1).findIndex((s) => s === 'solid');
    Object.assign(t, { depth: RING_GAP - 5, vy: 1000, streak: 2, angle: -((solid + 0.5) / SEGMENTS) * Math.PI * 2, target: -((solid + 0.5) / SEGMENTS) * Math.PI * 2 });
    dropOn(t, 0.05, 0);
    assert.equal(t.streak, 0);
    assert.ok(t.vy < 0);
  });

  it('every ring has a gap with no red right beside it; checkpoints have no red', () => {
    for (let n = 0; n < 80; n++) {
      const ring = ringAt(4, n);
      // Where the gap starts (it can wrap round from the last slice to the first).
      const gap = ring.findIndex((s, i) => s === 'gap' && ring[(i - 1 + SEGMENTS) % SEGMENTS] !== 'gap');
      assert.ok(gap >= 0);
      if (n % CHECKPOINT_EVERY === 0) assert.ok(!ring.includes('danger'), `ring ${n}`);
      const width = ring.filter((s) => s === 'gap').length;
      for (const d of [-1, width]) assert.notEqual(ring[(gap + d + SEGMENTS) % SEGMENTS], 'danger', `ring ${n}`);
    }
  });

  it('bounces on a slice, drops through a gap, and goes back to the checkpoint after landing on red', () => {
    const seed = 2;
    const t = newTower(seed);
    const solid = ringAt(seed, 0).indexOf('solid');
    t.target = t.angle = facing(solid);
    assert.equal(sliceUnderBall(t.angle), solid);
    for (let i = 0; i < TICK_HZ; i++) dropOn(t, 1 / TICK_HZ, (i * 1000) / TICK_HZ);
    assert.equal(t.deepest, 0, 'still on the first ring');
    assert.ok(t.depth <= 0);

    // Over the gap: through to ring 1.
    t.target = t.angle = facing(ringAt(seed, 0).indexOf('gap'));
    for (let i = 0; i < TICK_HZ; i++) dropOn(t, 1 / TICK_HZ, 1000 + (i * 1000) / TICK_HZ);
    assert.ok(t.deepest >= 1);

    // Onto red, a few rings down: back to the top of the last checkpoint once it's waited.
    let n = 1;
    while (!ringAt(seed, n).includes('danger')) n++;
    const red = ringAt(seed, n).indexOf('danger');
    Object.assign(t, { depth: n * RING_GAP - 5, vy: 300, deepest: n, respawnAt: null });
    t.target = t.angle = facing(red);
    dropOn(t, 1 / TICK_HZ, 5000);
    assert.notEqual(t.respawnAt, null);
    dropOn(t, 1 / TICK_HZ, 5000 + RESPAWN_MS + 10);
    assert.ok(t.depth < Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY * RING_GAP);
  });

  it('a careful player gets a good way down in a round', () => {
    const t = newTower(1);
    let target = 0;
    for (let tick = 0; tick < (ROUND_MS / 1000) * TICK_HZ; tick++) {
      const ms = (tick * 1000) / TICK_HZ;
      if (tick % 3 === 0) target = plan(t, ms);
      t.target = target;
      dropOn(t, 1 / TICK_HZ, ms);
    }
    assert.ok(t.deepest > 40, `only ${t.deepest} rings`);
  });
});
