import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DODGE_LEVELS, DOT_HIT_R, HIT_HALF, ROUND_MS, TICK_HZ, dotAt } from '../../shared/games/dodgeBox';
import { newDodger, stepDodger, type Dodger } from './dodgeBox';

const DT = 1 / TICK_HZ;
const TICK_MS = 1000 / TICK_HZ;

/** Would a box at (x, y) be touched by a dot at any moment in [ms, ms + ahead]? */
function danger(level: number, x: number, y: number, ms: number, ahead: number) {
  for (let t = ms; t <= ms + ahead; t += TICK_MS) {
    for (const p of DODGE_LEVELS[level].dots) {
      const d = dotAt(p, t);
      if (Math.hypot(d.x - Math.max(x - HIT_HALF, Math.min(x + HIT_HALF, d.x)), d.y - Math.max(y - HIT_HALF, Math.min(y + HIT_HALF, d.y))) < DOT_HIT_R + 6) return true;
    }
  }
  return false;
}

/** A careful bot: heads for the next coin (then the goal), only stepping where no dot will be soon. Returns ms taken, or null. */
function run(d: Dodger): number | null {
  const level = DODGE_LEVELS[d.level];
  for (let ms = TICK_MS; ms <= ROUND_MS; ms += TICK_MS) {
    const next = level.coins.find((_, i) => !d.coins.has(i));
    let [tx, ty] = next ?? [level.goal[0] + level.goal[2] / 2, level.goal[1] + level.goal[3] / 2];
    // The Gauntlet: keep to the clear lanes between the dots, and step out for a coin level with it.
    if (level.name === 'The Gauntlet') {
      if (d.x < 470 && Math.abs(d.x - tx) > 8) ty = 195;
      else if (d.x >= 470 && d.x <= 530) ty = 250;
      else if (next && d.x > 530 && Math.abs(d.y - ty) > 8) tx = 650;
    }
    let best: { x: number; y: number } = { x: 0, y: 0 };
    let bestScore = -Infinity;
    for (let a = -1; a < 8; a++) {
      const sx = a < 0 ? 0 : Math.cos((a * Math.PI) / 4);
      const sy = a < 0 ? 0 : Math.sin((a * Math.PI) / 4);
      const probe = { ...d, stick: { x: sx, y: sy }, coins: new Set(d.coins) };
      stepDodger(probe, DT, ms);
      if (danger(d.level, probe.x, probe.y, ms, 500)) continue;
      const score = -Math.hypot(tx - probe.x, ty - probe.y);
      if (score > bestScore) [best, bestScore] = [{ x: sx, y: sy }, score];
    }
    d.stick = best;
    if (stepDodger(d, DT, ms)) return ms;
  }
  return null;
}

describe('Dodge Box', () => {
  it('every level can be finished, carefully, in good time', () => {
    for (let level = 0; level < DODGE_LEVELS.length; level++) {
      const d = newDodger(level);
      const ms = run(d);
      assert.ok(ms !== null && ms < ROUND_MS / 2, `${DODGE_LEVELS[level].name}: ${ms} (${d.coins.size} coins, ${d.deaths} deaths)`);
    }
  });

  it('dying loses the coins picked up since the last checkpoint, and no others', () => {
    const at = DODGE_LEVELS.findIndex((l) => l.checkpoints.length > 0);
    const level = DODGE_LEVELS[at];
    const d = newDodger(at);
    const [cx, cy, cw, ch] = level.checkpoints[0];
    const dotOn = (ms: number) => dotAt(level.dots[0], ms);
    d.coins.add(0);
    Object.assign(d, { x: cx + cw / 2, y: cy + ch / 2 });
    stepDodger(d, DT, 0);
    d.coins.add(1);
    Object.assign(d, dotOn(0));
    stepDodger(d, DT, 0);
    assert.equal(d.deaths, 1);
    assert.deepEqual([...d.coins], [0]);
  });

  it('a dot sends you back to the start; the goal needs every coin', () => {
    const d = newDodger(0);
    const dot = dotAt(DODGE_LEVELS[0].dots[0], 0);
    Object.assign(d, { x: dot.x, y: dot.y });
    stepDodger(d, DT, 0);
    assert.equal(d.deaths, 1);
    assert.equal(d.x, 50);
    Object.assign(d, { x: 950, y: 250 });
    assert.equal(stepDodger(d, DT, 0), false, 'no coins yet');
  });
});
