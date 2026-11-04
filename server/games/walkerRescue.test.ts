import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROUND_MS, TICK_HZ, WALKER_LEVELS, WALKERS, type Skill } from '../../shared/games/walkerRescue';
import { assign, newRescue, tickRescue, type Rescue } from './walkerRescue';

const TICK_MS = 1000 / TICK_HZ;

/** Runs a level, calling `plan` each tick to hand out skills. Returns how many were saved. */
function run(r: Rescue, plan: (r: Rescue, ms: number) => void = () => {}) {
  for (let ms = 0; ms < ROUND_MS; ms += TICK_MS) {
    plan(r, ms);
    if (tickRescue(r, ms)) break;
  }
  return r.saved;
}

const first = (r: Rescue, where: (x: number, y: number) => boolean, doing = 'walk') => r.walkers.find((w) => w.doing === doing && where(w.x, w.y));

describe('Walker Rescue', () => {
  it('left alone, no level saves anyone', () => {
    for (let level = 0; level < WALKER_LEVELS.length; level++) assert.equal(run(newRescue(level)), 0, WALKER_LEVELS[level].name);
  });

  it('Dig Down: one digger opens the way for everyone', () => {
    const r = newRescue(0);
    let dug = false;
    run(r, (r) => {
      if (dug) return;
      const w = first(r, (x) => x >= 30 && x <= 34);
      if (w) dug = assign(r, 'dig', w.id);
    });
    assert.ok(r.saved >= WALKERS - 1, `${r.saved} saved`);
  });

  it('Mind the Gap: a builder bridges the gap and the others follow', () => {
    const r = newRescue(1);
    let built = false;
    run(r, (r) => {
      if (built) return;
      const w = first(r, (x) => x >= 31 && x <= 33);
      if (w && w.dir === 1) built = assign(r, 'build', w.id);
    });
    assert.ok(r.saved >= WALKERS - 2, `${r.saved} saved`);
  });

  it('Over the Wall: steps over it', () => {
    const r = newRescue(2);
    let built = false;
    run(r, (r) => {
      if (built) return;
      const w = first(r, (x) => x >= 26 && x <= 28);
      if (w && w.dir === 1) built = assign(r, 'build', w.id);
    });
    assert.ok(r.saved >= WALKERS - 2, `${r.saved} saved`);
  });

  it('skills run out, and a falling walker can only be given a float', () => {
    const r = newRescue(0);
    tickRescue(r, 0);
    const w = r.walkers[0];
    w.doing = 'fall';
    assert.equal(assign(r, 'dig', w.id), false);
    w.doing = 'walk';
    for (let ms = TICK_MS; ms < 3000; ms += TICK_MS) tickRescue(r, ms);
    const walker = r.walkers.find((o) => o.doing === 'walk')!;
    assert.ok(assign(r, 'block', walker.id));
    const other = r.walkers.find((o) => o.doing === 'walk' && o !== walker);
    if (other) assert.equal(assign(r, 'block' as Skill, other.id), false, 'none left');
  });
});
