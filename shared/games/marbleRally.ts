import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const MARBLE_RALLY: GameInfo = {
  id: 'marble-rally',
  name: 'Marble Rally',
  description: 'Tilt your phone to roll your marble along a narrow track in the sky. Slopes push it downhill; roll off the edge and you are back at the last checkpoint. Same course for everyone; first to the finish wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'First to the finish wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored as a race. A course is a grid of
// tiles: '.' nothing (fall!), '#' flat track, '>' '<' '^' 'v' slopes running downhill that way,
// 'S' the start, 'C' a checkpoint, 'G' the finish. Positions are in tiles (a tile's middle is
// +0.5); the TV draws TILE pixels a tile.

export const ROUND_MS = 120_000;
export const TICK_HZ = 30;
export const TILE = 56;
/** A full tilt pushes this hard (tiles/s²); a slope this hard; rolling slows by this share a second. */
export const ACCEL = 6;
export const SLOPE = 3.5;
export const FRICTION = 1.1;
export const MAX_SPEED = 5;
export const BALL_R = 0.28;
/** After falling, back at the checkpoint after this long. */
export const FALL_MS = 900;
export const DEAD_ZONE = 0.06;

export const COURSES: { name: string; rows: string[] }[] = [
  {
    name: 'First Steps',
    rows: [
      '...............',
      '.S##>>#C.......',
      '.......#.......',
      '.......#.......',
      '.......v.......',
      '.......#####...',
      '...........#...',
      '...........C>>G',
      '...............',
    ],
  },
  {
    name: 'The Zigzag',
    rows: [
      '...............',
      '.S###..........',
      '....##.........',
      '.....##C.......',
      '.......v.......',
      '.......###.....',
      '.........#<<<#.',
      '.............#.',
      '.........C####.',
      '.........G.....',
    ],
  },
  {
    name: 'Tightrope',
    rows: [
      '...............',
      '.S#>>>>#C......',
      '........#......',
      '........v......',
      '........#......',
      '.G#<<<<<C......',
      '...............',
    ],
  },
];

export const tileAt = (rows: string[], x: number, y: number) => rows[Math.floor(y)]?.[Math.floor(x)] ?? '.';
export const onTrack = (ch: string) => ch !== '.';

/** Where the start, checkpoints and finish are (tile middles), in order along the course. */
export function marks(rows: string[], ch: string) {
  const out: { x: number; y: number }[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push({ x: x + 0.5, y: y + 0.5 })));
  return out;
}

export interface MarbleState {
  course: number;
  x: number;
  y: number;
  /** Falling (and shrinking away), counting up from 0 to 1. */
  falling: number;
  checkpoints: number;
  falls: number;
}

export type MarbleHostView = BoardsHostView<MarbleState>;
export type MarblePlayerView = BoardsPlayerView<MarbleState>;
