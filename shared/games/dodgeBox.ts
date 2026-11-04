import type { BoardsHostView, BoardsPlayerView } from '../boards';
import type { GameInfo } from '../protocol';

export const DODGE_BOX: GameInfo = {
  id: 'dodge-box',
  name: 'Dodge Box',
  description: 'Steer your square from the start to the goal, picking up every coin on the way, past dots on patrol. Touch a dot and you are back at the last checkpoint. Same level for everyone; first to the goal wins.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'First to the goal (with every coin) wins.' }],
};

// A side-by-side boards game (see shared/boards.ts), scored as a race. Levels are hand-made, one a
// round. The dots' paths are worked out from the round's clock, so the TV draws them itself.
// Board units: BOARD_W × BOARD_H.

export const ROUND_MS = 120_000;
export const TICK_HZ = 30;
export const BOARD_W = 1000;
export const BOARD_H = 500;
/** The square looks this big (half-width), but only the middle HIT_HALF of it can be touched: touch is forgiving. */
export const BOX_HALF = 15;
export const HIT_HALF = 11;
export const DOT_R = 12;
export const DOT_HIT_R = 10;
export const COIN_R = 12;
export const SPEED = 240;

export type Rect = [number, number, number, number];

/** A dot: back and forth along a line, or round a circle, once every `period` ms, starting `phase` (0 to 1) of the way. */
export type Patrol = { line: [number, number, number, number]; period: number; phase: number } | { circle: [number, number, number]; period: number; phase: number };

export interface DodgeLevel {
  name: string;
  walls: Rect[];
  start: Rect;
  /** Checkpoints along the way (reaching one makes it where you go back to). */
  checkpoints: Rect[];
  goal: Rect;
  coins: [number, number][];
  dots: Patrol[];
}

const vertical = (x: number, phase: number, period = 1_800): Patrol => ({ line: [x, 165, x, 335], period, phase });

export const DODGE_LEVELS: DodgeLevel[] = [
  {
    name: 'The Corridor',
    walls: [
      [100, 0, 800, 150],
      [100, 350, 800, 150],
    ],
    start: [0, 0, 100, 500],
    checkpoints: [],
    goal: [900, 0, 100, 500],
    coins: [
      [445, 250],
      [705, 180],
    ],
    dots: [vertical(250, 0), vertical(380, 0.5), vertical(510, 0), vertical(640, 0.5), vertical(770, 0)],
  },
  {
    name: 'The Ring',
    walls: [
      [100, 0, 800, 40],
      [100, 460, 800, 40],
    ],
    start: [0, 0, 100, 500],
    checkpoints: [],
    goal: [900, 0, 100, 500],
    coins: [
      [500, 250],
      [500, 90],
      [500, 410],
    ],
    dots: [
      ...[0, 0.25, 0.5, 0.75].map((phase) => ({ circle: [500, 250, 110] as [number, number, number], period: 3_200, phase })),
      ...[0, 0.33, 0.66].map((phase) => ({ circle: [500, 250, 190] as [number, number, number], period: -4_400, phase })),
    ],
  },
  {
    name: 'The Gauntlet',
    walls: [
      [100, 0, 380, 120],
      [100, 380, 380, 120],
      [520, 0, 380, 120],
      [520, 380, 380, 120],
      [480, 0, 40, 200],
      [480, 300, 40, 200],
    ],
    start: [0, 0, 100, 500],
    checkpoints: [[480, 200, 40, 100]],
    goal: [900, 0, 100, 500],
    coins: [
      [300, 250],
      [700, 140],
      [700, 360],
    ],
    dots: [
      { line: [130, 140, 450, 140], period: 2_000, phase: 0 },
      { line: [130, 250, 450, 250], period: 2_000, phase: 0.5 },
      { line: [130, 360, 450, 360], period: 2_000, phase: 0 },
      vertical(600, 0, 1_400),
      vertical(700, 0.5, 1_400),
      vertical(800, 0, 1_400),
    ],
  },
];

/** Where a dot is `ms` into the round. */
export function dotAt(p: Patrol, ms: number) {
  const k = (((ms / p.period + p.phase) % 1) + 1) % 1;
  if ('line' in p) {
    const [ax, ay, bx, by] = p.line;
    const back = k < 0.5 ? k * 2 : 2 - k * 2;
    return { x: ax + (bx - ax) * back, y: ay + (by - ay) * back };
  }
  const [cx, cy, r] = p.circle;
  return { x: cx + Math.cos(k * Math.PI * 2) * r, y: cy + Math.sin(k * Math.PI * 2) * r };
}

export const inRect = ([x, y, w, h]: Rect, px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;

export interface DodgeState {
  level: number;
  x: number;
  y: number;
  coins: number[];
  deaths: number;
  /** Counts up with each death (for a flash). */
  deathId: number;
}

export type DodgeHostView = BoardsHostView<DodgeState>;
export type DodgePlayerView = BoardsPlayerView<DodgeState>;
