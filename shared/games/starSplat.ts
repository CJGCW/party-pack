import type { GameInfo, GiveUpView } from '../protocol';

// A hidden-pattern puzzle: paint balls are thrown at a brick wall, and a ball's colour and shape
// (and, from Hard up, the colour of its shape) decide which brick it hits, by a rule that's
// different every wall. Hit the bricks with stars on them to fill the stars.

export const LEVELS = [
  { id: '1', name: 'Easy', description: 'Colour and shape each pick a row or a column.' },
  { id: '2', name: 'Medium', description: 'As Easy, but the pattern shifts diagonally.' },
  { id: '3', name: 'Hard', description: 'A wall five times as big: colour, shape and the colour of the shape each pick a section, row or column.' },
  { id: '4', name: 'Very hard', description: 'As Hard, but the pattern shifts diagonally.' },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

export const STAR_SPLAT: GameInfo = {
  id: 'star-splat',
  name: 'Star Splat',
  description: "Throw paint balls at the wall to hit the stars. A ball's colour and shape decide where it lands: work out the pattern before you run out.",
  minPlayers: 1,
  maxPlayers: 8,
  // The VIP picks the difficulty in the lobby; the mode is that choice.
  modes: [
    { id: 'rising', name: 'Rising', description: 'Gets harder each wall, from Easy up.' },
    ...LEVELS.map((l) => ({ id: l.id, name: l.name, description: l.description })),
  ],
  choices: [
    {
      id: 'level',
      label: 'Difficulty (Rising: starts Easy and gets harder each wall)',
      options: [{ id: 'rising', label: 'Rising' }, ...LEVELS.map((l) => ({ id: l.id, label: l.name }))],
      noAny: true,
    },
  ],
};

/** The difficulty of wall number `index` (from 0) for a mode. */
export function levelFor(modeId: string, index: number): number {
  if (modeId === 'rising') return Math.min(LEVELS.length, index + 1);
  const n = Number(modeId);
  return n >= 1 && n <= LEVELS.length ? n : 1;
}

/** Ball colours, and shapes (by name, drawn by each screen). */
export const PAINTS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2', '#b48cff'];
export const PAINT_NAMES = ['red', 'yellow', 'green', 'blue', 'purple'];
export const SHAPES = ['triangle', 'square', 'diamond', 'hexagon', 'cross'] as const;
export type Shape = (typeof SHAPES)[number];

/** A shape's outline, centred on 0, 0 and about 1 across each way, for the screens to draw. */
export function shapePoints(shape: number): [number, number][] {
  const ring = (n: number, r: number, turn: number) =>
    Array.from({ length: n }, (_, i): [number, number] => {
      const a = turn + (i / n) * Math.PI * 2;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
  switch (SHAPES[shape]) {
    case 'triangle':
      return ring(3, 0.62, -Math.PI / 2).map(([x, y]) => [x, y + 0.1]);
    case 'square':
      return [[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [-0.42, 0.42]];
    case 'diamond':
      return ring(4, 0.58, -Math.PI / 2);
    case 'hexagon':
      return ring(6, 0.52, 0);
    default: {
      const a = 0.16;
      const b = 0.52;
      return [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]];
    }
  }
}

/** A five-pointed star's outline, centred on 0, 0 with points `r` out, for the screens to draw. */
export function starPoints(r = 1): [number, number][] {
  return Array.from({ length: 10 }, (_, i): [number, number] => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 === 0 ? r : r * 0.45;
    return [d * Math.cos(a), d * Math.sin(a)];
  });
}

/**
 * A ball: a circle of its colour with its shape on it, in the shape's own colour from Hard up
 * (white below that).
 */
export interface Ball {
  /** Index into PAINTS. */
  color: number;
  /** Index into SHAPES. */
  shape: number;
  /** From Hard up: the colour of the shape (index into PAINTS). */
  inner?: number;
}

/** The wall's size at a level: always 5 rows; 5 columns, or 25 in five sections of 5. */
export function wallSize(level: number) {
  return level >= 3 ? { rows: 5, cols: 25, sections: 5 } : { rows: 5, cols: 5, sections: 1 };
}

/** Targets: two bricks with one star, four with two, two with three. */
export const TARGET_STARS = [1, 1, 2, 2, 2, 2, 3, 3];
export const TOTAL_STARS = TARGET_STARS.reduce((a, b) => a + b, 0);
/** Balls per wall, and time per wall, at each level (1 to 4). */
export const AMMO = [13, 14, 15, 16];
export const WALL_MS = [120_000, 150_000, 180_000, 210_000];

// ---- Scoring -------------------------------------------------------------------------------

/** Stars are worth up to this share of a wall's points; filling them all adds the rest for time left. */
export const STARS_SHARE = 0.85;

// ---- Views ---------------------------------------------------------------------------------

/**
 * 'play': everyone throws at their own copy of the wall.
 * 'reveal': everyone's wall, and the rule.
 * 'gameEnd': round scores.
 */
export type SplatPhase = 'play' | 'reveal' | 'gameEnd';

export interface Target {
  /** Brick index: row * cols + col. */
  cell: number;
  stars: number;
}

export interface Hit {
  cell: number;
  ball: Ball;
}

/** At the reveal: a ball that hits each target (the rule itself is never spelt out). */
export type Answers = { cell: number; ball: Ball }[];

export interface SplatPlayerProgress {
  id: string;
  name: string;
  color: string;
  score: number;
  stars: number;
  ballsLeft: number;
  /** Out of balls or all stars filled (or gave up). */
  done: boolean;
  /** ms into the wall when they filled every star, if they did. */
  finishMs: number | null;
  /** At the reveal: their throws, and the points they scored. */
  hits: Hit[] | null;
  points: number;
  gamePoints: number;
}

export interface SplatHostView {
  phase: SplatPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  level: number;
  msLeft: number;
  phaseMs: number;
  targets: Target[];
  players: SplatPlayerProgress[];
  answers: Answers | null;
}

export interface SplatPlayerView extends GiveUpView {
  phase: SplatPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  level: number;
  msLeft: number;
  targets: Target[];
  hits: Hit[];
  ammo: number;
  ballsLeft: number;
  stars: number;
  done: boolean;
  finishMs: number | null;
  points: number;
  gamePoints: number;
  score: number;
  answers: Answers | null;
}

export type SplatInput = { type: 'throw'; ball: Ball };
