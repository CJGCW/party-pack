import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RANGES, clampFace, facesFor, matchScore } from '../../shared/games/faceFix';

describe('Face Fix', () => {
  it('a face matches itself perfectly, and less the further it is off', () => {
    const { target, start } = facesFor(5, 0);
    assert.deepEqual(facesFor(5, 0).target, target);
    assert.equal(matchScore(target, target), 100);
    const near = { ...target, w: target.w + 0.05 };
    assert.ok(matchScore(near, target) > matchScore(start, target));
    assert.ok(matchScore(start, target) < 100);
  });

  it('faces are kept in range', () => {
    const wild = clampFace({ w: 9, h: -3, eyeY: NaN, eyeGap: 0.3, noseY: 0, mouthY: 0.2, mouthW: 0.5 });
    assert.equal(wild.w, RANGES.w[1]);
    assert.equal(wild.h, RANGES.h[0]);
    assert.equal(wild.eyeY, RANGES.eyeY[0]);
  });
});
