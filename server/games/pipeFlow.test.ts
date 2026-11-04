import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CROSS, E, N, NO_PIECE, PIECES, REPLACE_MS, S, W, WATER_START_MS, across, flowMsAt, flowThrough, pieceAt, sourceFor } from '../../shared/games/pipeFlow';
import { flowOn, lay, newPlumbing, type Plumbing } from './pipeFlow';

/** Puts a particular piece on a square (as if it came from the queue). */
function put(p: Plumbing, cell: number, piece: number) {
  p.pieces[cell] = piece;
}
const piece = (open: number) => PIECES.indexOf(open);

describe('Pipe Flow', () => {
  it('water goes in one side of a piece and out the other; straight through a crossing', () => {
    assert.equal(flowThrough(piece(E | W), W), E);
    assert.equal(flowThrough(piece(N | E), N), E);
    assert.equal(flowThrough(piece(N | E), S), null);
    assert.equal(flowThrough(CROSS, N), S);
    assert.equal(flowThrough(NO_PIECE, N), null);
  });

  it('the same seed gives the same tap and pieces; the water speeds up', () => {
    assert.deepEqual(sourceFor(4), sourceFor(4));
    assert.deepEqual([0, 1, 2, 3].map((n) => pieceAt(4, n)), [0, 1, 2, 3].map((n) => pieceAt(4, n)));
    assert.ok(flowMsAt(80_000) < flowMsAt(WATER_START_MS));
  });

  it('can lay on empty squares (not the tap or water); swapping a dry piece locks the board a moment', () => {
    const p = newPlumbing(2);
    assert.equal(lay(p, p.source.cell, 0), false);
    const spot = p.source.cell === 0 ? 1 : 0;
    assert.equal(lay(p, spot, 0), true);
    assert.equal(lay(p, spot, 100), true, 'swap');
    assert.equal(lay(p, spot === 0 ? 2 : 3, 200), false, 'locked');
    assert.equal(lay(p, spot === 0 ? 2 : 3, 100 + REPLACE_MS), true);
  });

  it('the water fills along the pipe and spills where it ends', () => {
    const p = newPlumbing(3);
    // A straight run of three pieces out of the tap (if there's room), then nothing.
    const out = p.source.out;
    const straight = out === N || out === S ? piece(N | S) : piece(E | W);
    let cell = p.source.cell;
    let laid = 0;
    for (let k = 0; k < 3; k++) {
      cell = across(cell, out);
      if (cell < 0) break;
      put(p, cell, straight);
      laid++;
    }
    assert.equal(flowOn(p, WATER_START_MS - 1), false);
    let spilledAt = -1;
    for (let ms = WATER_START_MS; ms < WATER_START_MS + 20_000 && spilledAt < 0; ms += 100) if (flowOn(p, ms)) spilledAt = ms;
    assert.equal(p.filled.length, laid);
    assert.ok(spilledAt > WATER_START_MS);
  });
});
