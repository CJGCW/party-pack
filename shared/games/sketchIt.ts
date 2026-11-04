import type { GameInfo } from '../protocol';

export const SKETCH_IT: GameInfo = {
  id: 'sketch-it',
  name: 'Sketch It',
  description: 'Take turns drawing a secret word on your phone while everyone else watches it appear on the TV and types guesses. The quicker you guess, the more you score; the artist scores for everyone who gets it.',
  minPlayers: 2,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Everyone draws once a round (twice with two players).' }],
};

// Turns go round: the artist draws on their phone, the strokes go to the server and on to the TV,
// and everyone else guesses on theirs (matched forgivingly, as Pick 'Em's typed answers are).
// Drawings are in canvas units: CANVAS_W × CANVAS_H.

export const DRAW_MS = 75_000;
export const REVEAL_MS = 4_500;
export const CANVAS_W = 1000;
export const CANVAS_H = 700;
/** Halfway through, a letter of the word is shown as a hint. */
export const HINT_AT = 0.5;
export const INK_COLORS = ['#140f2e', '#ff5d73', '#4cd37a', '#5ec8f2', '#ffd166', '#ffffff'];
export const INK_WIDTHS = [6, 14, 30];

/** Easy things to draw (all family friendly). */
export const SKETCH_WORDS = [
  'apple', 'banana', 'pizza', 'cake', 'ice cream', 'carrot', 'cheese', 'egg', 'cookie', 'grapes',
  'cat', 'dog', 'fish', 'bird', 'snake', 'spider', 'elephant', 'giraffe', 'rabbit', 'turtle',
  'octopus', 'penguin', 'snail', 'butterfly', 'bee', 'frog', 'duck', 'pig', 'cow', 'horse',
  'house', 'castle', 'bridge', 'tent', 'lighthouse', 'tree', 'flower', 'mushroom', 'cactus', 'leaf',
  'sun', 'moon', 'star', 'rainbow', 'cloud', 'snowman', 'volcano', 'mountain', 'island', 'wave',
  'car', 'bus', 'train', 'rocket', 'boat', 'bicycle', 'plane', 'tractor', 'helicopter', 'submarine',
  'guitar', 'drum', 'piano', 'trumpet', 'balloon', 'kite', 'robot', 'crown', 'sword', 'shield',
  'umbrella', 'glasses', 'hat', 'shoe', 'sock', 'clock', 'key', 'lamp', 'chair', 'bed',
  'book', 'pencil', 'scissors', 'camera', 'phone', 'television', 'ladder', 'hammer', 'anchor', 'bell',
  'ghost', 'dragon', 'mermaid', 'pirate', 'wizard', 'alien', 'dinosaur', 'unicorn', 'monster', 'clown',
];

export function wordFor(seed: number, turn: number) {
  let s = (seed + turn * 9_973) >>> 0 || 1;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return SKETCH_WORDS[s % SKETCH_WORDS.length];
}

/** The word as blanks (letters shown where `shown`), spaces kept. */
export const blanks = (word: string, shown: number[] = []) => [...word].map((ch, i) => (ch === ' ' ? '  ' : shown.includes(i) ? ch.toUpperCase() : '_')).join(' ');

export interface Stroke {
  id: number;
  color: number;
  width: number;
  /** x, y pairs in canvas units. */
  points: number[];
}

export type SketchPhase = 'draw' | 'reveal' | 'result' | 'gameEnd';

export interface SketchPlayer {
  id: string;
  name: string;
  color: string;
  /** Guessed this turn, and how quickly (ms). */
  gotIt: number | null;
  turnPoints: number;
  roundPoints: number;
  points: number;
  gamePoints: number;
}

export interface SketchView {
  phase: SketchPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  turn: number;
  turns: number;
  artist: string;
  /** The word as blanks (with any hint letters), or in full at the reveal (and on the artist's phone). */
  word: string;
  strokes: Stroke[];
  players: SketchPlayer[];
  msLeft: number;
  /** On a phone: whose phone it is, and their wrong guesses this turn. */
  you?: string;
  misses?: string[];
}

export type SketchInput =
  /** Adds points to a stroke (starting it if it's new). */
  | { type: 'ink'; id: number; color: number; width: number; points: number[] }
  | { type: 'clear' }
  | { type: 'guess'; text: string };
