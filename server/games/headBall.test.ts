import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HEAD_Y, ROUND_MS, STUN_MS, TICK_HZ, throwAt, throwsFor } from '../../shared/games/headBall';
import { newHeader, stepHeader, type Header } from './headBall';

/** Plays a round with a bot that heads for where the next ball (or away from the next boot) will come down. */
function play(h: Header, chase: boolean) {
  for (let t = 1; (t * 1000) / TICK_HZ <= ROUND_MS; t++) {
    const ms = (t * 1000) / TICK_HZ;
    const next = h.throws.find((o) => !h.met.has(o.id) && o.at <= ms && throwAt(o, ms)!.y < HEAD_Y);
    if (chase && next) {
      // Where it'll be at head height.
      const s = (-next.vy + Math.sqrt(next.vy ** 2 + 2 * 700 * (HEAD_Y - next.y))) / 700;
      const landX = next.x + next.vx * s;
      const want = next.boot ? (landX > 250 ? landX - 160 : landX + 160) : landX;
      h.tilt = Math.max(-1, Math.min(1, (want - h.x) / 60));
    } else h.tilt = 0;
    stepHeader(h, 1 / TICK_HZ, ms);
  }
}

describe('Head Ball', () => {
  it('everyone gets the same throws; each comes down at head height', () => {
    const throws = throwsFor(11);
    assert.deepEqual(throws, throwsFor(11));
    assert.ok(throws.length > 40);
    assert.ok(throws.some((t) => t.boot) && throws.some((t) => !t.boot));
  });

  it('chasing the balls heads far more than standing still', () => {
    const keen = newHeader(5);
    play(keen, true);
    const idle = newHeader(5);
    play(idle, false);
    assert.ok(keen.headed > idle.headed + 10, `${keen.headed} vs ${idle.headed}`);
  });

  it('a boot to the head stuns you: no moving, no heading', () => {
    const h = newHeader(5);
    h.stunnedUntil = 1000 + STUN_MS;
    h.tilt = 1;
    const x = h.x;
    stepHeader(h, 0.5, 1000);
    assert.equal(h.x, x);
  });
});
