import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CELL, COLS, HOP_MS, RESPAWN_MS, ROUND_MS, TICK_HZ, lanesFor, movers, type Dir } from '../../shared/games/roadHop';
import { hop, hopOn, inDanger, newHopper, type Hopper } from './roadHop';

/** Whether hopping `dir` now keeps you safe for the next moment (or, with no dir, staying put). */
function safe(h: Hopper, dir: Dir | null, ms: number) {
  const t: Hopper = { ...h, lastHopAt: -Infinity };
  if (dir) {
    hop(t, dir, ms);
    if (t.row === h.row && t.x === h.x) return false;
  }
  for (let k = 0; k <= 8; k++) {
    hopOn(t, 0.05, ms + k * 50);
    if (t.respawnAt !== null) return false;
  }
  return true;
}

describe('Road Hop', () => {
  it('starts on grass, and every road, river or railway has grass beyond it', () => {
    const lanes = lanesFor(4);
    assert.deepEqual(lanes.slice(0, 3).map((l) => l.kind), ['grass', 'grass', 'grass']);
    for (let i = 0; i < 200; i++) {
      if (lanes[i].kind === 'grass') continue;
      let j = i;
      while (lanes[j].kind !== 'grass') j++;
      assert.ok(j - i <= 4, `row ${i}: ${j - i} rows without grass`);
    }
    // Trees never block the middle of the grass.
    for (const l of lanes) for (const c of l.trees) assert.ok(Math.abs(c - (COLS - 1) / 2) > 1);
  });

  it('hops a cell at a time, no faster than HOP_MS, blocked by trees and the edges', () => {
    const h = newHopper(1);
    hop(h, 'up', 0);
    assert.deepEqual([h.row, h.best], [1, 1]);
    hop(h, 'up', HOP_MS - 1);
    assert.equal(h.row, 1, 'too soon');
    for (let i = 1; i <= 6; i++) hop(h, 'left', i * HOP_MS);
    assert.equal(h.x, CELL / 2, 'stops at the left edge');
  });

  it('a car or the water sends you back to the last grass after a moment', () => {
    const h = newHopper(2);
    const roadRow = h.lanes.findIndex((l) => l.kind === 'road');
    const road = h.lanes[roadRow];
    // Stand right on a car.
    const car = movers(road, 5000).find((x) => x > 0 && x + road.length < 700)!;
    Object.assign(h, { row: roadRow, x: car + road.length / 2 });
    assert.ok(inDanger(h, 5000));
    hopOn(h, 1 / TICK_HZ, 5000);
    assert.notEqual(h.respawnAt, null);
    hopOn(h, 1 / TICK_HZ, 5000 + RESPAWN_MS + 10);
    assert.equal(h.lanes[h.row].kind, 'grass');
    assert.ok(h.row < roadRow);
  });

  it('a careful hopper gets a good way across in a round', () => {
    const h = newHopper(1);
    for (let tick = 0; tick < (ROUND_MS / 1000) * TICK_HZ; tick++) {
      const ms = (tick * 1000) / TICK_HZ;
      if (h.respawnAt === null && ms - h.lastHopAt >= HOP_MS) {
        const dir = safe(h, 'up', ms) ? 'up' : !safe(h, null, ms) ? (['left', 'right'] as const).find((d) => safe(h, d, ms)) : undefined;
        if (dir) hop(h, dir, ms);
      }
      hopOn(h, 1 / TICK_HZ, ms);
    }
    assert.ok(h.best >= 30, `only ${h.best} rows`);
  });
});
