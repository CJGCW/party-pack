import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAST_AT_MS, CRASH_MS, GATE_WIDTH, ROUND_MS, ROW_GAP, SKIER_R, TICK_HZ, TREE_R, VIEW_W, gateInRow, treesInRow } from '../../shared/games/snowChase';
import { newSkier, skiOn, type Skier } from './snowChase';

/** Skis a round: toward the next gate, and (if careful) along whichever line is clear of the trees ahead. Returns when they were caught, or null. */
function ski(s: Skier, careful: boolean) {
  for (let tick = 0; tick < (ROUND_MS / 1000) * TICK_HZ; tick++) {
    const ms = (tick * 1000) / TICK_HZ;
    let aimX = s.x;
    const row = Math.ceil(s.y / ROW_GAP);
    for (let n = row; n < row + 4; n++) {
      const g = gateInRow(s.seed, n);
      if (g) {
        aimX = g.left + GATE_WIDTH / 2;
        break;
      }
    }
    if (careful) {
      const ahead = [row, row + 1, row + 2].flatMap((n) => treesInRow(s.seed, n)).filter((t) => t.y > s.y + 10 && t.y < s.y + 350);
      let best = aimX;
      let bestD = Infinity;
      for (let x = 40; x <= VIEW_W - 40; x += 20) {
        const clear = ahead.every((t) => Math.abs(t.x - x) > TREE_R + SKIER_R + 30 && Math.abs(t.x - (s.x + x) / 2) > TREE_R + SKIER_R);
        const d = Math.abs(x - aimX) + Math.abs(x - s.x) * 0.5;
        if (clear && d < bestD) [best, bestD] = [x, d];
      }
      aimX = best;
    }
    s.heading = Math.max(-1.25, Math.min(1.25, (aimX - s.x) / 200));
    if (skiOn(s, 1 / TICK_HZ, ms)) return ms;
  }
  return null;
}

describe('Snow Chase', () => {
  it('hitting a tree stops you for a moment (once per tree)', () => {
    const s = newSkier(3);
    let n = 4;
    while (!treesInRow(3, n).length) n++;
    const tree = treesInRow(3, n)[0];
    Object.assign(s, { x: tree.x, y: tree.y - 5, heading: 0 });
    skiOn(s, 1 / TICK_HZ, 10_000);
    assert.equal(s.crashedUntil, 10_000 + CRASH_MS);
    const y = s.y;
    skiOn(s, 1 / TICK_HZ, 10_500);
    assert.equal(s.y, y, 'stopped');
    skiOn(s, 1 / TICK_HZ, 10_000 + CRASH_MS + 10);
    assert.ok(s.y > y, 'off again');
    assert.equal(s.hit.size, 1);
  });

  it('the beast only comes after a minute; careful skiing lasts much longer than careless', () => {
    const careless = newSkier(1);
    const caughtCareless = ski(careless, false);
    assert.ok(caughtCareless !== null && caughtCareless > BEAST_AT_MS);
    for (const seed of [1, 3]) {
      const careful = ski(newSkier(seed), true);
      assert.ok(careful === null || careful > caughtCareless! + 8_000, `seed ${seed}: caught at ${careful}`);
    }
  });

  it('passing between the flags counts a gate', () => {
    const s = newSkier(2);
    const gate = gateInRow(2, 8)!;
    Object.assign(s, { x: gate.left + GATE_WIDTH / 2, y: gate.y - 5, heading: 0 });
    skiOn(s, 1 / TICK_HZ, 5000);
    assert.equal(s.gates, 1);
  });
});
