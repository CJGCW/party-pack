import type { GameInfo, GiveUpView } from './protocol';
import { shapePoints } from './games/starSplat';

// Wumbles, and the logic puzzles they get into. A Wumble has four traits of five options each.
// Everything here's drawn from the same simple shapes, so the TV and the phones match.

export type Traits = number[];
/** Colour, hat, eyes, feet. */
export const TRAIT_NAMES = ['colour', 'hat', 'eyes', 'feet'];
/** A badge for each trait, on the links in Seating Chart. */
export const TRAIT_BADGES = ['🎨', '🎩', '👀', '👟'];
export const TRAIT_OPTIONS = 5;

export const PAINTS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2', '#b48cff'];
const INK = '#140f2e';
const CREAM = '#fff4d6';
const GREY = '#8d86b8';

/** Something to draw, in a box from -50 to 50 each way. */
export type Prim =
  | { t: 'circle'; x: number; y: number; r: number; fill?: string; line?: string; w?: number }
  | { t: 'poly'; pts: [number, number][]; fill?: string; line?: string; w?: number; open?: boolean };

const ring = (n: number, r: number, cx = 0, cy = 0, turn = -Math.PI / 2, squash = 1): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = turn + (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * squash * Math.sin(a)];
  });

const poly = (pts: [number, number][], fill: string, w = 2.5): Prim => ({ t: 'poly', pts, fill, line: INK, w });
const line = (pts: [number, number][], w = 3, color = CREAM): Prim => ({ t: 'poly', pts, line: color, w, open: true });
const dot = (x: number, y: number, r: number, fill: string, w = 0): Prim => ({ t: 'circle', x, y, r, fill, ...(w ? { line: INK, w } : {}) });

function hat(i: number): Prim[] {
  switch (i) {
    case 0: // Party hat
      return [poly([[-13, -20], [13, -20], [0, -47]], CREAM), dot(0, -47, 3.5, CREAM, 2)];
    case 1: // Crown
      return [poly([[-16, -19], [-18, -40], [-8, -29], [0, -43], [8, -29], [18, -40], [16, -19]], CREAM)];
    case 2: // Antenna
      return [line([[0, -22], [0, -40]], 3.5), dot(0, -42, 7, CREAM, 2.5)];
    case 3: // Top hat
      return [poly([[-20, -23], [20, -23], [20, -18], [-20, -18]], CREAM), poly([[-12, -23], [12, -23], [12, -46], [-12, -46]], CREAM)];
    case 4: // Horns
      return [poly([[-19, -18], [-9, -23], [-23, -43]], CREAM), poly([[19, -18], [9, -23], [23, -43]], CREAM)];
    default:
      return [];
  }
}

function eyes(i: number): Prim[] {
  const eye = (x: number, y: number, r: number) => [dot(x, y, r, '#ffffff', 2), dot(x, y, r * 0.48, INK)];
  switch (i) {
    case 0: // Two
      return [...eye(-10, 2, 7), ...eye(10, 2, 7)];
    case 1: // One big one
      return eye(0, 2, 12);
    case 2: // Three
      return [...eye(-14, 5, 5.5), ...eye(0, -2, 5.5), ...eye(14, 5, 5.5)];
    case 3: // Sleepy
      return [line([[-17, 3], [-10, 7], [-3, 3]], 3.5, INK), line([[3, 3], [10, 7], [17, 3]], 3.5, INK)];
    case 4: // Shades
      return [poly([[-21, -3], [21, -3], [21, 3], [13, 10], [4, 10], [0, 4], [-4, 10], [-13, 10], [-21, 3]], INK, 1)];
    default:
      return [dot(-9, 3, 3, INK), dot(9, 3, 3, INK)];
  }
}

function feet(i: number): Prim[] {
  const both = (draw: (x: number) => Prim[]) => [...draw(-13), ...draw(13)];
  switch (i) {
    case 0: // Boots
      return both((x) => [poly([[x - 6, 29], [x + 6, 29], [x + 6, 40], [x + 11 * Math.sign(x), 40], [x + 11 * Math.sign(x), 47], [x - 6, 47]], CREAM)]);
    case 1: // Wheels
      return both((x) => [dot(x, 39, 9, CREAM, 2.5), dot(x, 39, 2.5, INK)]);
    case 2: // Springs
      return both((x) => [line([[x, 31], [x - 6, 34], [x + 6, 37], [x - 6, 40], [x + 6, 43], [x, 47]], 3)]);
    case 3: // Flippers
      return both((x) => [poly([[x - 3, 31], [x + 3, 31], [x + 13, 46], [x - 13, 46]], CREAM)]);
    case 4: // Stilts
      return both((x) => [line([[x, 31], [x, 45]], 3.5), line([[x - 6, 47], [x + 6, 47]], 3.5)]);
    default:
      return both((x) => [line([[x, 31], [x, 44]], 3, GREY)]);
  }
}

/** A Wumble: a -1 trait is left plain, which makes a chip showing just the others. */
export function wumblePrims(t: Traits): Prim[] {
  const body: [number, number][] = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const r = 27 * (1 + 0.09 * Math.sin(a));
    return [r * Math.cos(a), 6 + r * Math.sin(a)];
  });
  return [...feet(t[3]), poly(body, t[0] >= 0 ? PAINTS[t[0]] : GREY), ...hat(t[1]), ...eyes(t[2])];
}

function botTop(i: number): Prim[] {
  switch (i) {
    case 0:
      return [line([[0, -24], [0, -44]], 4), dot(0, -44, 5, CREAM, 2)];
    case 1:
      return [line([[-12, -24], [-18, -44]], 4), line([[12, -24], [18, -44]], 4)];
    case 2:
      return [poly([[-22, -24], [22, -24], [14, -40], [-14, -40]], CREAM)];
    case 3:
      return [poly(ring(14, 15, 0, -30, 0, 0.7), CREAM)];
    case 4:
      return [poly([[-20, -24], [-20, -42], [-8, -32], [8, -42], [20, -32], [20, -24]], CREAM)];
    default:
      return [];
  }
}

function botBase(i: number): Prim[] {
  switch (i) {
    case 0: // Tracks
      return [poly([[-26, 30], [26, 30], [30, 38], [26, 46], [-26, 46], [-30, 38]], CREAM), dot(-15, 38, 3, INK), dot(0, 38, 3, INK), dot(15, 38, 3, INK)];
    case 1: // One ball
      return [dot(0, 38, 11, CREAM, 2.5)];
    case 2: // Skirt
      return [poly([[-16, 30], [16, 30], [28, 47], [-28, 47]], CREAM)];
    case 3: // Bow legs
      return [line([[-12, 30], [-20, 38], [-12, 47]], 4), line([[12, 30], [20, 38], [12, 47]], 4)];
    case 4: // Rockets
      return [poly([[-22, 30], [-6, 30], [-14, 47]], CREAM), poly([[6, 30], [22, 30], [14, 47]], CREAM)];
    default:
      return [];
  }
}

/** Their robot cousins, for Lookalikes: colour, chest mark, what's on top, what's underneath. */
export function botPrims(t: Traits): Prim[] {
  const chest = shapePoints(t[1]).map(([x, y]): [number, number] => [x * 28, 3 + y * 28]);
  return [...botBase(t[3]), ...botTop(t[2]), poly([[-28, -26], [28, -26], [28, 31], [-28, 31]], PAINTS[t[0]]), poly(chest, '#ffffff', 2)];
}

/** Stepping Stones' tiles: shape, colour, mark. */
export const TILE_OPTIONS = 4;
export function tilePrims(t: Traits): Prim[] {
  const outline: [number, number][][] = [ring(24, 44), [[-40, -40], [40, -40], [40, 40], [-40, 40]], ring(6, 46), ring(4, 48)];
  const mark = shapePoints([0, 1, 2, 4][t[2]]).map(([x, y]): [number, number] => [x * 34, y * 34]);
  return [poly(outline[t[0]], PAINTS[t[1]], 3), poly(mark, INK, 1)];
}

/** Anything a puzzle shows. */
export interface Piece {
  /** Wumble, bot, tile, emoji, or a blocked square. */
  k: 'w' | 'b' | 't' | 'e' | 'x';
  t?: Traits;
  e?: string;
  /** Picked out with a gold ring. */
  on?: boolean;
  dim?: boolean;
}
export const wumble = (t: Traits, extra: Partial<Piece> = {}): Piece => ({ k: 'w', t, ...extra });

export function piecePrims(p: Piece): Prim[] {
  if (p.k === 'w') return wumblePrims(p.t!);
  if (p.k === 'b') return botPrims(p.t!);
  if (p.k === 't') return tilePrims(p.t!);
  if (p.k === 'x') return [poly(ring(9, 40, 0, 4), '#4a4470'), poly(ring(7, 18, -8, -8), '#6a6496', 0)];
  return [];
}

/** One way to play each difficulty, and how long and how many slips it allows. */
export interface LevelSpec {
  name: string;
  description: string;
  ms: number;
  tries: number;
}

/** The game's entry: the VIP picks the difficulty in the lobby, and that's the mode. */
export function critterInfo(id: string, name: string, description: string, levels: LevelSpec[], maxPlayers = 8): GameInfo {
  return {
    id,
    name,
    description,
    minPlayers: 1,
    maxPlayers,
    modes: [{ id: 'rising', name: 'Rising', description: 'Gets harder each puzzle, from Easy up.' }, ...levels.map((l, i) => ({ id: String(i + 1), name: l.name, description: l.description }))],
    choices: [
      {
        id: 'level',
        label: 'Difficulty (Rising: starts Easy and gets harder each puzzle)',
        options: [{ id: 'rising', label: 'Rising' }, ...levels.map((l, i) => ({ id: String(i + 1), label: l.name }))],
        noAny: true,
      },
    ],
  };
}

/** The difficulty (from 1) of puzzle number `index` (from 0) for a mode. */
export function critterLevel(modeId: string, index: number, levels: number): number {
  if (modeId === 'rising') return Math.min(levels, index + 1);
  const n = Number(modeId);
  return n >= 1 && n <= levels ? n : 1;
}

export type CritterPhase = 'play' | 'reveal' | 'gameEnd';
export interface Note {
  text: string;
  kind: '' | 'good' | 'bad';
}

/** A bunch of things to show on the TV, laid out `cols` across. */
export interface StageGroup {
  label?: string;
  pieces: Piece[];
  cols?: number;
}

export interface CritterPlayerView<S = unknown> extends GiveUpView {
  phase: CritterPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  level: number;
  levelName: string;
  msLeft: number;
  got: number;
  goal: number;
  triesLeft: number;
  triesMax: number;
  done: boolean;
  finishMs: number | null;
  points: number;
  gamePoints: number;
  score: number;
  note: Note | null;
  /** True once the answer's out. */
  revealing: boolean;
  state: S;
}

export interface CritterProgress {
  id: string;
  name: string;
  color: string;
  got: number;
  goal: number;
  triesLeft: number;
  triesMax: number;
  done: boolean;
  finishMs: number | null;
  points: number;
  gamePoints: number;
}

export interface CritterHostView {
  title: string;
  phase: CritterPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  levelName: string;
  msLeft: number;
  stage: StageGroup[];
  players: CritterProgress[];
}
