import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { PuzzleLevel, PuzzleState } from '../physPuzzle';
import type { GameInfo } from '../protocol';

export const INK_RUN: GameInfo = {
  id: 'ink-run',
  name: 'Ink Run',
  description: 'Everyone gets the same level: a ball, some ground and a flag. Draw with your finger and what you draw becomes solid and drops into place. Then tap Run to let the ball roll. Ink is limited. First to get the ball to the flag wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'First to the flag wins.' }],
};

// A side-by-side boards game (see shared/boards.ts) built on physics puzzles (shared/physPuzzle.ts),
// scored as a race. Strokes come from the phone in board pixels.

export const ROUND_MS = 120_000;
/** Ink for each try (metres of stroke); Clear gives it back. */
export const INK = 9;
/** Strokes are this thick (metres). */
export const STROKE_HALF = 0.07;
/** A stroke has at most this many points. */
export const MAX_POINTS = 40;

export const INK_LEVELS: PuzzleLevel[] = [
  {
    name: 'Mind the Gap',
    ground: [
      [
        [0, 0],
        [3.5, 0],
        [3.5, 2.5],
        [0, 4],
      ],
      [
        [6.5, 0],
        [10, 0],
        [10, 2.5],
        [6.5, 2.5],
      ],
      [
        [3.5, -1],
        [6.5, -1],
        [6.5, 0],
        [3.5, 0],
      ],
    ],
    ball: { x: 0.5, y: 4.15, r: 0.3 },
    goal: { x: 8, y: 2.5, w: 2, h: 1.2 },
  },
  {
    name: 'Over the Wall',
    ground: [
      [
        [0, -1],
        [10, -1],
        [10, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [3, 0],
        [0, 5],
      ],
      [
        [5, 0],
        [5.4, 0],
        [5.4, 1],
        [5, 1],
      ],
    ],
    ball: { x: 0.4, y: 5, r: 0.3 },
    goal: { x: 7.5, y: 0, w: 2.5, h: 1.5 },
  },
  {
    name: 'Step Up',
    ground: [
      [
        [0, -1],
        [10, -1],
        [10, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [3, 0],
        [0, 5],
      ],
      [
        [7, 0],
        [10, 0],
        [10, 1],
        [7, 1],
      ],
    ],
    ball: { x: 0.4, y: 5, r: 0.3 },
    goal: { x: 8.5, y: 1, w: 1.5, h: 1.2 },
  },
];

export interface InkState extends PuzzleState {
  inkLeft: number;
  /** Why the last stroke wasn't drawn ('' if it was). */
  refused: string;
}

export type InkHostView = BoardsHostView<InkState>;
export type InkPlayerView = BoardsPlayerView<InkState>;

export type InkInput =
  /** A stroke, as board-pixel points (flat x, y pairs). */
  { type: 'stroke'; points: number[] } | { type: 'run' } | { type: 'retry' } | { type: 'clear' };
