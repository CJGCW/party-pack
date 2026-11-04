import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_TILT, ROUND_MS, TICK_HZ, WORLD_W, groundAt, moonFor } from '../../shared/games/moonDrop';
import { flyMoon, newMoon, type Lander, type Moon } from './moonDrop';

/** A careful pilot: drifts over the pad, then comes down slowly and upright. */
function pilot(m: Moon, l: Lander, padIndex: number) {
  const pad = m.pads[padIndex];
  const mid = (pad.x0 + pad.x1) / 2;
  for (let t = 0; t < ROUND_MS / (1000 / TICK_HZ) && l.status === 'flying'; t++) {
    const dx = mid - l.x;
    // Lean towards the pad to get going, and back to stop over it.
    const wantVx = Math.max(-60, Math.min(60, dx * 0.6));
    l.target = Math.max(-0.5, Math.min(0.5, (wantVx - l.vx) * 0.03)) * (MAX_TILT / 1.4);
    if (Math.abs(dx) < 15 && Math.abs(l.vx) < 10) l.target = 0;
    const height = groundAt(m.points, l.x) - l.y;
    const wantVy = Math.abs(dx) > 40 ? Math.min(20, height - 120) : Math.min(40, height * 0.2);
    l.thrusting = l.vy > wantVy;
    flyMoon(m, 1 / TICK_HZ);
  }
}

describe('Moon Drop', () => {
  it('the surface is the same for everyone, with three flat pads', () => {
    const a = moonFor(4);
    assert.deepEqual(a, moonFor(4));
    assert.equal(a.pads.length, 3);
    for (const p of a.pads) assert.equal(groundAt(a.points, (p.x0 + p.x1) / 2), p.y);
    assert.equal(a.points[a.points.length - 1][0], WORLD_W);
  });

  it('dropping without thrust crashes; a careful landing on a pad scores', () => {
    const dropped = newMoon(4, ['faller']);
    const faller = dropped.landers[0];
    for (let t = 0; t < 30 * TICK_HZ && faller.status === 'flying'; t++) flyMoon(dropped, 1 / TICK_HZ);
    assert.equal(faller.status, 'crashed');
    assert.equal(faller.score, 0);
    const m = newMoon(4, ['pilot']);
    const flyer = m.landers[0];
    pilot(m, flyer, m.pads.findIndex((p) => p.mult === 2));
    assert.equal(flyer.status, 'landed');
    assert.ok(flyer.score >= 200);
  });
});
