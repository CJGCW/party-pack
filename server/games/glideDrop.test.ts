import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FLIGHTS, MAX_PITCH, RINGS, TICK_HZ, ringScore, targetFor } from '../../shared/games/glideDrop';
import { newGlider, stepGlider, type Glider } from './glideDrop';

const DT = 1 / TICK_HZ;

/** Flies one flight with a pilot that steers for the target; returns where it came down. */
function fly(g: Glider, ms: number, aim: boolean) {
  const target = targetFor(g.seed, g.flight);
  for (let t = 0; t < 60 * TICK_HZ && g.status === 'flying'; t++) {
    if (aim) {
      // Glide angle needed to come down on the target from here.
      const need = -Math.atan2(g.y, Math.max(1, target - g.x));
      g.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH * 0.3, need));
      if (target - g.x < g.y * 0.15 && g.y > 5) g.open = false;
    }
    stepGlider(g, DT, (ms += 1000 / TICK_HZ));
  }
  return ms;
}

describe('Glide Drop', () => {
  it('rings score more the closer to the middle', () => {
    assert.equal(ringScore(0), RINGS[0][1]);
    assert.equal(ringScore(-30), 25);
    assert.equal(ringScore(500), 0);
  });

  it('a pilot who steers for the target lands on it; three flights, then done', () => {
    let hits = 0;
    for (const seed of [1, 2, 3, 4]) {
      const g = newGlider(seed);
      let ms = 0;
      for (let f = 0; f < FLIGHTS; f++) {
        ms = fly(g, ms, true);
        assert.equal(g.status, 'landed');
        if (g.scores[f] > 0) hits++;
        for (let k = 0; k < 3 * TICK_HZ; k++) stepGlider(g, DT, (ms += 1000 / TICK_HZ));
      }
      assert.equal(g.status, 'done');
      assert.equal(g.scores.length, FLIGHTS);
    }
    assert.ok(hits >= 8, `${hits} of 12 hit`);
  });

  it('just letting it glide rarely scores', () => {
    let total = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = newGlider(seed);
      fly(g, 0, false);
      total += g.scores[0];
    }
    assert.ok(total <= 100, `${total}`);
  });
});
