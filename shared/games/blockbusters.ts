import type { GameInfo } from '../protocol';
import { TRIVIA } from './trivia';

/** Its question banks are Trivia's, so it has the same topics. */
export const BLOCKBUSTERS: GameInfo = {
  id: 'blockbusters',
  name: 'Blockbusters',
  description: 'Two teams race across a board of letters. Answer a question that starts with a letter to take its hexagon; first to link their sides wins.',
  minPlayers: 2,
  maxPlayers: 8,
  modes: TRIVIA.modes,
};

/**
 * Red links the top and bottom edges; White links the left and right. With an even number of
 * players the teams are equal and the board is 4 by 4. With an odd number, Red is the smaller
 * team and the board is the show's 5 wide by 4 high, so Red needs 4 hexagons and White 5.
 */
export type Team = 'red' | 'white';

export const boardSize = (playerCount: number) => (playerCount % 2 === 0 ? { cols: 4, rows: 4 } : { cols: 5, rows: 4 });

/**
 * Hexagons are flat-topped, in columns, with every odd column shifted down half a hexagon (as
 * on the show). Cells are numbered row by row: index = row * cols + col.
 */
export function neighbours(index: number, cols: number, rows: number): number[] {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const odd = col % 2 === 1;
  const offsets = odd
    ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return offsets
    .map(([dc, dr]) => [col + dc, row + dr])
    .filter(([c, r]) => c >= 0 && c < cols && r >= 0 && r < rows)
    .map(([c, r]) => r * cols + c);
}

/** The hexagons of a winning path for `team` (top to bottom for Red, left to right for White), or null. */
export function winningPath(owners: (Team | null)[], team: Team, cols: number, rows: number): number[] | null {
  const starts = owners.flatMap((o, i) => (o === team && (team === 'red' ? i < cols : i % cols === 0) ? [i] : []));
  const isGoal = (i: number) => (team === 'red' ? Math.floor(i / cols) === rows - 1 : i % cols === cols - 1);
  const from = new Map<number, number>(starts.map((s) => [s, -1]));
  const queue = [...starts];
  while (queue.length) {
    const cell = queue.shift()!;
    if (isGoal(cell)) {
      const path: number[] = [];
      for (let c = cell; c !== -1; c = from.get(c)!) path.unshift(c);
      return path;
    }
    for (const n of neighbours(cell, cols, rows)) {
      if (owners[n] === team && !from.has(n)) {
        from.set(n, cell);
        queue.push(n);
      }
    }
  }
  return null;
}

/**
 * The frame's four bands for a w x h board: Red's top and bottom, White's left and right. They
 * meet on 45° lines from the corners, so every point belongs to the edge it's nearest.
 */
export function frameBands(w: number, h: number): Record<'top' | 'bottom' | 'left' | 'right', [number, number][]> {
  const d = Math.min(w, h) / 2;
  const a: [number, number] = [d, d];
  const b: [number, number] = [w - d, d];
  const c: [number, number] = [w - d, h - d];
  const e: [number, number] = [d, h - d];
  return {
    top: [[0, 0], [w, 0], b, a],
    right: [[w, 0], [w, h], c, b],
    bottom: [[w, h], [0, h], e, c],
    left: [[0, h], [0, 0], a, e],
  };
}

/**
 * 'pick': the team in control chooses a letter.
 * 'question': the question is read out a letter at a time; anyone not locked out can buzz,
 *   which stops the reading where it is.
 * 'answer': whoever buzzed types their answer.
 * 'result': whether they were right, and the answer.
 * 'boardEnd': a team linked its sides.
 */
export type BlockbustersPhase = 'pick' | 'question' | 'answer' | 'result' | 'boardEnd' | 'gameEnd';

export interface BlockbustersHex {
  letter: string;
  owner: Team | null;
}

export interface BlockbustersPlayerInfo {
  id: string;
  name: string;
  color: string;
  /** Null for someone who joined after the teams were made (they watch). */
  team: Team | null;
  score: number;
  gamePoints: number;
}

interface ViewBase {
  phase: BlockbustersPhase;
  board: number;
  totalBoards: number;
  cols: number;
  rows: number;
  hexes: BlockbustersHex[];
  /** The team choosing the next letter. */
  control: Team;
  /** The hexagon being played for. */
  current: number | null;
  /** The whole question; only the first `revealed` characters have been read out so far. */
  question: string | null;
  revealed: number;
  /** Still being read: one more character every `charMs`, starting from `revealed`. */
  reading: boolean;
  charMs: number;
  /** Who buzzed, and which teams can't buzz on this question any more. */
  buzzer: { id: string; name: string; team: Team } | null;
  lockedOut: Team[];
  /** At 'result': what the buzzer typed, whether it was right (null if nobody buzzed), and the answer. */
  guess: string | null;
  correct: boolean | null;
  answer: string | null;
  /** At 'boardEnd': the winners and their path. */
  winner: Team | null;
  winningPath: number[];
  /** Boards each team has won this game. */
  wins: Record<Team, number>;
  msLeft: number;
}

export interface BlockbustersHostView extends ViewBase {
  topic: string;
  players: BlockbustersPlayerInfo[];
}

export interface BlockbustersPlayerView extends ViewBase {
  myTeam: Team | null;
  /** This player buzzed in (and answers). */
  isBuzzer: boolean;
  /** Points this game, and in the whole session. */
  gamePoints: number;
  score: number;
}

export type BlockbustersInput = { type: 'pick'; index: number } | { type: 'buzz' } | { type: 'answer'; text: string };
