import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GRAVITY, JUMP_SPEED, RESPAWN_MS, ROUND_MS, TICK_HZ, VIEW_W, platformX, platformsFor, type Platform } from '../../shared/games/skyHop';
import { hopOn, newHopper, type Hopper } from './skyHop';

/** A player who picks the highest platform they can reach (not a cracked one) as they take off, and steers for it. */
function climb(h: Hopper, seconds: number) {
  let target: Platform | null = null;
  let lastVy = 0;
  for (let tick = 0; tick < seconds * TICK_HZ; tick++) {
    const ms = (tick * 1000) / TICK_HZ;
    if ((h.vy > 0 && lastVy <= 0) || !target) {
      const peak = h.y + Math.max(0, h.vy) ** 2 / (2 * GRAVITY);
      const options = h.platforms.filter((p) => p.y > h.y + 20 && p.y < peak - 40 && p.kind !== 'breaking');
      target = options[options.length - 1] ?? null;
    }
    lastVy = h.vy;
    if (target) {
      let dx = platformX(target, ms) + target.w / 2 - h.x;
      if (dx > VIEW_W / 2) dx -= VIEW_W;
      if (dx < -VIEW_W / 2) dx += VIEW_W;
      h.steer = Math.max(-0.6, Math.min(0.6, dx / 200));
    }
    hopOn(h, 1 / TICK_HZ, ms);
  }
}

describe('Sky Hop', () => {
  it('the path up is always within a jump, and everyone gets the same platforms', () => {
    const jump = JUMP_SPEED ** 2 / (2 * GRAVITY);
    const path = platformsFor(6).filter((p) => p.kind !== 'breaking');
    for (let i = 1; i < path.length; i++) assert.ok(path[i].y - path[i - 1].y < jump - 60, `step ${i}`);
    assert.deepEqual(platformsFor(6).slice(0, 50), platformsFor(6).slice(0, 50));
  });

  it("bounces on platforms, breaks cracked ones, and falling puts you back on the last checkpoint", () => {
    const h = newHopper(2);
    // Standing on the ground: it keeps bouncing there.
    for (let i = 0; i < TICK_HZ * 3; i++) hopOn(h, 1 / TICK_HZ, (i * 1000) / TICK_HZ);
    assert.ok(h.y >= 0 && h.respawnAt === null);
    // A cracked platform gives way.
    const cracked = h.platforms.find((p) => p.kind === 'breaking')!;
    Object.assign(h, { x: platformX(cracked, 5000) + cracked.w / 2, y: cracked.y + 5, vy: -200, steer: 0 });
    hopOn(h, 1 / TICK_HZ, 5000);
    assert.ok(h.broken.has(cracked.n));
    assert.ok(h.vy < 0, 'still falling');
    // Falling well below the best height: back on the checkpoint after a moment.
    Object.assign(h, { best: 5000, top: 5000, y: 3000, vy: -500 });
    hopOn(h, 1 / TICK_HZ, 6000);
    assert.notEqual(h.respawnAt, null);
    hopOn(h, 1 / TICK_HZ, 6000 + RESPAWN_MS + 10);
    assert.equal(h.respawnAt, null);
    assert.ok(h.y <= h.checkpoint.y + 50);
  });

  it('a careful player climbs a long way in a round', () => {
    const h = newHopper(1);
    climb(h, ROUND_MS / 1000);
    assert.ok(h.best > 10_000, `only ${Math.round(h.best)}`);
  });
});
