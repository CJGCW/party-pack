// What a pipe grid looks like, for both screens to draw the same way: each piece as segments from
// a square's middle out to its open sides, and the water as the same segments it's filled.

import { CROSS, E, N, NO_PIECE, PIECES, S, W, type PipeState, type Side } from './pipeFlow';

export type Segment = { x1: number; y1: number; x2: number; y2: number };

const OUT: Record<Side, [number, number]> = { [N]: [0, -0.5], [E]: [0.5, 0], [S]: [0, 0.5], [W]: [-0.5, 0] };

/** A piece's segments in a square of size `cell` at (x, y), its top-left. */
export function pieceSegments(piece: number, x: number, y: number, cell: number): Segment[] {
  if (piece === NO_PIECE) return [];
  const cx = x + cell / 2;
  const cy = y + cell / 2;
  return ([N, E, S, W] as Side[])
    .filter((side) => PIECES[piece] & side)
    .map((side) => ({ x1: cx, y1: cy, x2: cx + OUT[side][0] * cell, y2: cy + OUT[side][1] * cell }));
}

/** The water's segments: through each filled square, in by one side and out by the other (straight across a crossing). */
export function waterSegments(state: PipeState, cols: number, cell: number, ox = 0, oy = 0): Segment[] {
  const segs: Segment[] = [];
  const at = (c: number) => ({ x: ox + (c % cols) * cell + cell / 2, y: oy + Math.floor(c / cols) * cell + cell / 2 });
  // Out of the tap.
  const src = at(state.source.cell);
  segs.push({ x1: src.x, y1: src.y, x2: src.x + OUT[state.source.out][0] * cell, y2: src.y + OUT[state.source.out][1] * cell });
  for (const f of state.filled) {
    const c = at(f.cell);
    const piece = state.pieces[f.cell];
    const outSides = piece === CROSS ? [opposite(f.in)] : ([N, E, S, W] as Side[]).filter((s) => PIECES[piece] & s && s !== f.in);
    segs.push({ x1: c.x + OUT[f.in][0] * cell, y1: c.y + OUT[f.in][1] * cell, x2: c.x, y2: c.y });
    for (const s of outSides) segs.push({ x1: c.x, y1: c.y, x2: c.x + OUT[s][0] * cell, y2: c.y + OUT[s][1] * cell });
  }
  return segs;
}

function opposite(side: Side): Side {
  return side === N ? S : side === S ? N : side === E ? W : E;
}
