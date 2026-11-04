import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROUND_MS, TICK_HZ, TUBES, hazardsFor, laneAt, targetPosition, type Tube } from '../../shared/games/tempestRun';
import { newRunner, runOn, slide, type Runner } from './tempestRun';

/** A player who moves to the nearest lane with nothing arriving soon, once they've seen it coming for a moment. */
function dodge(r: Runner, ms: number) {
  const { tube } = r;
  const danger = new Set(r.hazards.filter((h) => h.arriveMs > ms && h.arriveMs < ms + 700 && h.spawnMs + 400 < ms).map((h) => h.lane));
  const here = laneAt(tube, r.position);
  if (!danger.has(here)) return;
  let best = here;
  let bestD = Infinity;
  for (let l = 0; l < tube.lanes; l++) {
    if (danger.has(l)) continue;
    let d = Math.abs(l + 0.5 - r.position);
    if (tube.closed) d = Math.min(d, tube.lanes - d);
    if (d < bestD) [best, bestD] = [l, d];
  }
  r.target = best + 0.5;
}

function survives(tube: Tube, seed: number, until: number) {
  const r = newRunner(seed, tube);
  for (let tick = 0; tick < (until / 1000) * TICK_HZ; tick++) {
    const ms = (tick * 1000) / TICK_HZ;
    dodge(r, ms);
    if (runOn(r, 1 / TICK_HZ, ms)) return false;
  }
  return true;
}

describe('Tempest Run', () => {
  it('everyone gets the same hazards, and no wave fills too much of the tube', () => {
    for (const tube of TUBES) {
      assert.deepEqual(hazardsFor(3, tube), hazardsFor(3, tube));
      const waves = new Map<number, Set<number>>();
      for (const h of hazardsFor(3, tube)) waves.set(h.arriveMs, (waves.get(h.arriveMs) ?? new Set()).add(h.lane));
      for (const lanes of waves.values()) assert.ok(lanes.size <= Math.floor(tube.lanes * 0.4), tube.id);
    }
  });

  it('the middle of the steering is the bottom of the tube; turning right moves you right', () => {
    const circle = TUBES[0];
    const bottom = targetPosition(circle, 0);
    // At the bottom: the screen angle there is straight down (π/2).
    assert.ok(Math.abs(circle.start + bottom * circle.span - Math.PI / 2) < 1e-9);
    // Right of the bottom is a lane counting down (lanes count clockwise from the top).
    assert.ok(targetPosition(circle, 0.2) < bottom);
    // Sliding takes time: no jumping straight across.
    const r = newRunner(1, circle);
    r.target = (bottom + circle.lanes / 2) % circle.lanes;
    slide(r, 1 / TICK_HZ);
    assert.ok(Math.abs(r.position - bottom) < 1);
  });

  it('standing still gets you hit; a player who dodges gets well into every tube', () => {
    for (const tube of TUBES) {
      const idle = newRunner(5, tube);
      let hitAt = -1;
      for (let tick = 0; tick < (ROUND_MS / 1000) * TICK_HZ && hitAt < 0; tick++) if (runOn(idle, 1 / TICK_HZ, (tick * 1000) / TICK_HZ)) hitAt = tick;
      assert.ok(hitAt > 0, `${tube.id}: never hit standing still`);
      assert.ok(survives(tube, 1, 60_000), `${tube.id}: the dodger went out before a minute`);
    }
  });
});
