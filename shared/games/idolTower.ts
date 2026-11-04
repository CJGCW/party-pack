import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';
import { trackAt, type Recording } from '../volleys';

export const IDOL_TOWER: GameInfo = {
  id: 'idol-tower',
  name: 'Idol Tower',
  description: 'Everyone gets the same tower with a golden idol on top. Tap the wooden blocks to knock them out, one at a time, until none are left; the stone ones stay. If the idol touches the ground, the tower resets and you lose a few seconds. First to clear their tower wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'First to clear every wooden block wins.' }],
};

// A side-by-side boards game (see shared/boards.ts) with the tower on the phone, scored as a race.
// The world's in metres, y up, WORLD wide and WORLD_H tall with the ground at 0; boards are drawn PX pixels a
// metre (y down) under a strip for the name.

export const ROUND_MS = 90_000;
export const WORLD = 10;
export const WORLD_H = 6;
export const PX = 50;
export const TOP = 40;
export const BOARD_W = WORLD * PX;
export const BOARD_H = TOP + WORLD_H * PX;
/** After the idol falls, the tower's back as it started, and you wait this long. */
export const RESET_MS = 3_000;

export type BlockKind = 'wood' | 'stone' | 'idol';

/** A block in a level: what it is, its middle and half-size (metres), and stone that's fixed to the ground. */
export interface LevelBlock {
  kind: BlockKind;
  x: number;
  y: number;
  hw: number;
  hh: number;
  fixed?: boolean;
}

/** The towers (one a round, in turn). Each can be cleared, in the right order (see the tests). */
export const LEVELS: { name: string; blocks: LevelBlock[] }[] = [
  {
    name: 'Pedestal',
    blocks: [
      { kind: 'stone', x: 5, y: 0.5, hw: 1, hh: 0.5 },
      { kind: 'wood', x: 5, y: 1.25, hw: 1.6, hh: 0.25 },
      { kind: 'wood', x: 4.2, y: 1.9, hw: 0.3, hh: 0.4 },
      { kind: 'wood', x: 5.8, y: 1.9, hw: 0.3, hh: 0.4 },
      { kind: 'wood', x: 5, y: 2.55, hw: 1.2, hh: 0.25 },
      { kind: 'idol', x: 5, y: 3.25, hw: 0.3, hh: 0.45 },
    ],
  },
  {
    name: 'Bridge',
    blocks: [
      { kind: 'stone', x: 3, y: 1.2, hw: 0.4, hh: 1.2, fixed: true },
      { kind: 'stone', x: 7, y: 1.2, hw: 0.4, hh: 1.2, fixed: true },
      { kind: 'wood', x: 5, y: 2.6, hw: 2.6, hh: 0.2 },
      { kind: 'wood', x: 4, y: 3.2, hw: 0.4, hh: 0.4 },
      { kind: 'wood', x: 5.2, y: 3.1, hw: 0.5, hh: 0.3 },
      { kind: 'wood', x: 6.6, y: 3.2, hw: 0.4, hh: 0.4 },
      { kind: 'idol', x: 6.6, y: 4.05, hw: 0.3, hh: 0.45 },
    ],
  },
  {
    name: 'Pyramid',
    blocks: [
      { kind: 'stone', x: 5, y: 0.3, hw: 0.9, hh: 0.3 },
      { kind: 'wood', x: 4, y: 1.05, hw: 0.45, hh: 0.45 },
      { kind: 'wood', x: 5, y: 1.05, hw: 0.45, hh: 0.45 },
      { kind: 'wood', x: 6, y: 1.05, hw: 0.45, hh: 0.45 },
      { kind: 'wood', x: 4.5, y: 1.95, hw: 0.45, hh: 0.45 },
      { kind: 'wood', x: 5.5, y: 1.95, hw: 0.45, hh: 0.45 },
      { kind: 'wood', x: 5, y: 2.6, hw: 0.9, hh: 0.2 },
      { kind: 'idol', x: 5, y: 3.25, hw: 0.3, hh: 0.45 },
    ],
  },
  {
    name: 'Ledge',
    blocks: [
      { kind: 'stone', x: 2, y: 2, hw: 0.4, hh: 2, fixed: true },
      { kind: 'wood', x: 5.6, y: 2, hw: 0.2, hh: 2 },
      { kind: 'wood', x: 3.8, y: 4.15, hw: 2, hh: 0.15 },
      { kind: 'wood', x: 4.8, y: 4.6, hw: 0.3, hh: 0.3 },
      { kind: 'idol', x: 2, y: 4.75, hw: 0.3, hh: 0.45 },
    ],
  },
];

/** Board pixels from world metres (y flips). */
export const toBoard = (x: number, y: number) => ({ x: x * PX, y: TOP + (WORLD_H - y) * PX });

// ---- Views ---------------------------------------------------------------------------------

/** A block where it stands now (board pixels, y down; angle in radians, clockwise). */
export interface BlockView {
  id: number;
  kind: BlockKind;
  hw: number;
  hh: number;
  x: number;
  y: number;
  a: number;
}

export interface TowerState {
  blocks: BlockView[];
  /** The last tap's settling (played from how the blocks stood before it), and the blocks as they were then. */
  shot: Recording | null;
  before: BlockView[] | null;
  /** Counts up with each tap, so a phone or TV knows to play the new one. */
  moveId: number;
  removed: number;
  removable: number;
  falls: number;
  /** The idol's just fallen (shown before the reset). */
  fell: boolean;
  /** Can't tap until this long from now (after a fall). */
  lockedMs: number;
  level: string;
}


/** Where every block is `seconds` into the last tap's settling, or as they stand once it's done. */
export function towerAt(s: TowerState, seconds: number | null): BlockView[] {
  if (seconds === null || !s.shot || !s.before) return s.blocks;
  const frame = seconds * s.shot.fps;
  if (frame >= s.shot.frames) return s.blocks;
  const tracks = new Map(s.shot.tracks.map((t) => [t.id, t]));
  const out: BlockView[] = [];
  for (const b of s.before) {
    const track = tracks.get(b.id);
    const at = track ? trackAt(track, frame) : 'before';
    if (at === 'gone') continue;
    out.push(at === 'before' ? b : { ...b, x: at.x, y: at.y, a: at.a });
  }
  return out;
}

export type TowerHostView = BoardsHostView<TowerState>;
export type TowerPlayerView = BoardsPlayerView<TowerState>;

export type TowerInput = { type: 'tap'; id: number };
