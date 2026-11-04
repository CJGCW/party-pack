import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { PuzzleLevel, PuzzleState } from '../physPuzzle';
import type { GameInfo } from '../protocol';

export const GIZMO_GOAL: GameInfo = {
  id: 'gizmo-goal',
  name: 'Gizmo Goal',
  description: 'Everyone gets the same machine puzzle: a ball, some ground, a flag and a few parts to place. Put planks, bumpers and fans where they will steer the ball, then tap Run to try it. Adjust and run again. First to the flag wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'First to the flag wins.' }],
};

// A side-by-side boards game (see shared/boards.ts) built on physics puzzles (shared/physPuzzle.ts),
// scored as a race. Parts are fixed where they're put: a plank (turns in steps), a bumper (bouncy)
// and a fan (blows upwards in a column above it).

export const ROUND_MS = 120_000;
export type PartKind = 'plank' | 'bouncer' | 'fan';
export const PLANK_HALF = { w: 0.8, h: 0.07 };
export const BOUNCER_R = 0.35;
/** A fan: its half-width and how high its air reaches (metres). */
export const FAN_HALF = 0.4;
export const FAN_REACH = 3;
/** A plank turns this much (radians) a tap. */
export const TURN_STEP = Math.PI / 12;

export interface GizmoLevel extends PuzzleLevel {
  /** The parts you're given. */
  tray: Partial<Record<PartKind, number>>;
}

export const GIZMO_LEVELS: GizmoLevel[] = [
  {
    name: 'Out of the Cup',
    ground: [
      [
        [0, -1],
        [10, -1],
        [10, 0],
        [0, 0],
      ],
      [
        [2.2, 0],
        [2.5, 0],
        [2.5, 1.4],
        [2.2, 1.4],
      ],
    ],
    ball: { x: 1, y: 5.3, r: 0.3 },
    goal: { x: 8, y: 0, w: 2, h: 1.5 },
    tray: { plank: 2 },
  },
  {
    name: 'Updraft',
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
        [0, 4],
      ],
      [
        [6, 0],
        [6.4, 0],
        [6.4, 1.8],
        [6, 1.8],
      ],
    ],
    ball: { x: 0.4, y: 4, r: 0.3 },
    goal: { x: 7.5, y: 0, w: 2.5, h: 1.5 },
    tray: { fan: 1 },
  },
  {
    name: 'Bank Shot',
    ground: [
      [
        [0, -1],
        [10, -1],
        [10, 0],
        [0, 0],
      ],
      [
        [0, 4.4],
        [2.2, 4.4],
        [2.2, 4.5],
        [0, 5],
      ],
      [
        [6.5, 0],
        [10, 0],
        [10, 2.2],
        [6.5, 2.2],
      ],
    ],
    ball: { x: 0.5, y: 5.22, r: 0.3 },
    goal: { x: 8, y: 2.2, w: 2, h: 1.3 },
    tray: { plank: 1, bouncer: 1 },
  },
];

export interface GizmoState extends PuzzleState {
  /** Parts left in the tray. */
  tray: Partial<Record<PartKind, number>>;
  refused: string;
}

export type GizmoHostView = BoardsHostView<GizmoState>;
export type GizmoPlayerView = BoardsPlayerView<GizmoState>;

export type GizmoInput =
  /** Place a part with its middle here (board pixels). */
  | { type: 'place'; part: PartKind; x: number; y: number }
  | { type: 'turn'; id: number }
  | { type: 'remove'; id: number }
  | { type: 'run' }
  | { type: 'retry' };
