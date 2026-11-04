import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BLAST_R, DOT_R, FIELD_H, FIELD_W, chainFrom, dotAt, dotsFor } from '../../shared/games/popChain';

describe('Pop Chain', () => {
  it('dots drift and bounce, staying in the field; everyone gets the same', () => {
    const dots = dotsFor(9, 0);
    assert.deepEqual(dots, dotsFor(9, 0));
    for (const d of dots) {
      for (const ms of [0, 1234, 9999, 60_000]) {
        const p = dotAt(d, ms);
        assert.ok(p.x >= DOT_R - 1e-9 && p.x <= FIELD_W - DOT_R + 1e-9 && p.y >= DOT_R - 1e-9 && p.y <= FIELD_H - DOT_R + 1e-9);
      }
    }
  });

  it('a tap on a dot pops it and sets off a chain; a tap in an empty corner may pop nothing', () => {
    const dots = dotsFor(3, 2);
    const at = 2000;
    const target = dotAt(dots[0], at);
    const chain = chainFrom(dots, target.x, target.y, at);
    assert.ok(chain.popped[0] >= at, 'the dot tapped pops');
    const count = chain.popped.filter((t) => t >= 0).length;
    assert.ok(count >= 1);
    // Each later blast is a popped dot.
    assert.equal(chain.blasts.length / 3, count + 1);
    // Far from every dot at that moment: nothing.
    const far = chainFrom([dots[0]], (target.x + FIELD_W / 2) % FIELD_W, (target.y + FIELD_H / 2) % FIELD_H, at);
    const d = Math.hypot(far.blasts[0] - target.x, far.blasts[1] - target.y);
    if (d > BLAST_R + DOT_R + 200) assert.equal(far.popped[0], -1);
  });
});
