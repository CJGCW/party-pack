import {
  BINGO_BONUS,
  CENTER,
  LETTER_VALUES,
  RACK_SIZE,
  SIZE,
  premiumAt,
  type MoveCheck,
  type Placement,
  type ScoredMove,
} from '../../../shared/games/rackAttack';
import { ROOT, child, eachChild, isBoardWord, isEnd, isWord } from './lexicon';

/** SIZE x SIZE letters; '' is empty. */
export type Board = string[][];

export const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<string>(SIZE).fill(''));

const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;

function isEmptyBoard(board: Board) {
  return board.every((row) => row.every((s) => !s));
}

// ---- Checking and scoring a play ---------------------------------------------------

/**
 * Checks a play against the board and rack, and scores it: tiles in one line with no
 * gaps, touching what's already there (or covering the centre on an empty board),
 * and every word it forms in the dictionary.
 */
export function checkMove(board: Board, rack: string[], tiles: Placement[]): MoveCheck {
  if (tiles.length === 0) return { ok: false, error: 'Place some tiles.' };
  if (tiles.length > RACK_SIZE) return { ok: false, error: 'Too many tiles.' };
  const seen = new Set<string>();
  for (const t of tiles) {
    if (!Number.isInteger(t.row) || !Number.isInteger(t.col) || !inside(t.row, t.col)) return { ok: false, error: 'Off the board.' };
    if (typeof t.letter !== 'string' || !/^[A-Z]$/.test(t.letter)) return { ok: false, error: 'Bad tile.' };
    if (board[t.row][t.col]) return { ok: false, error: 'That square is taken.' };
    const key = `${t.row},${t.col}`;
    if (seen.has(key)) return { ok: false, error: 'Two tiles on one square.' };
    seen.add(key);
  }
  // The letters have to come from the rack.
  const left = [...rack];
  for (const t of tiles) {
    const i = left.indexOf(t.letter);
    if (i < 0) return { ok: false, error: `You don't have that ${t.letter}.` };
    left.splice(i, 1);
  }

  const sameRow = tiles.every((t) => t.row === tiles[0].row);
  const sameCol = tiles.every((t) => t.col === tiles[0].col);
  if (!sameRow && !sameCol) return { ok: false, error: 'Tiles must be in one line.' };

  const placed = new Map(tiles.map((t) => [`${t.row},${t.col}`, t.letter]));
  const at = (r: number, c: number) => (inside(r, c) ? placed.get(`${r},${c}`) ?? board[r][c] : '');

  // No gaps between the first and last new tile.
  const across = sameRow && (tiles.length > 1 || !sameCol || hasNeighbour(at, tiles[0], 0, 1));
  const lineTiles = [...tiles].sort((a, b) => (across ? a.col - b.col : a.row - b.row));
  const firstT = lineTiles[0];
  const lastT = lineTiles[lineTiles.length - 1];
  for (let i = across ? firstT.col : firstT.row; i <= (across ? lastT.col : lastT.row); i++) {
    if (!(across ? at(firstT.row, i) : at(i, firstT.col))) return { ok: false, error: 'No gaps between tiles.' };
  }

  if (isEmptyBoard(board)) {
    if (!placed.has(`${CENTER},${CENTER}`)) return { ok: false, error: 'The first play covers the centre.' };
  } else {
    const touches = tiles.some((t) =>
      [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([dr, dc]) => !!(inside(t.row + dr, t.col + dc) && board[t.row + dr][t.col + dc])),
    );
    if (!touches) return { ok: false, error: 'Connect to the tiles on the board.' };
  }

  // Every word formed: the main line, plus one crossing each new tile.
  const words: { word: string; score: number }[] = [];
  const addWord = (r: number, c: number, dr: number, dc: number) => {
    while (at(r - dr, c - dc)) {
      r -= dr;
      c -= dc;
    }
    let word = '';
    let sum = 0;
    let wordMult = 1;
    for (; at(r, c); r += dr, c += dc) {
      const ch = at(r, c);
      word += ch;
      let value = LETTER_VALUES[ch];
      if (placed.has(`${r},${c}`)) {
        const p = premiumAt(r, c);
        if (p === 'DL') value *= 2;
        if (p === 'TL') value *= 3;
        if (p === 'DW' || p === 'STAR') wordMult *= 2;
        if (p === 'TW') wordMult *= 3;
      }
      sum += value;
    }
    if (word.length >= 2) words.push({ word, score: sum * wordMult });
  };
  const [dr, dc] = across ? [0, 1] : [1, 0];
  addWord(firstT.row, firstT.col, dr, dc);
  for (const t of tiles) addWord(t.row, t.col, dc, dr);
  if (words.length === 0) return { ok: false, error: 'Make a word of at least two letters.' };
  const bad = words.find((w) => !isWord(w.word));
  if (bad) return { ok: false, error: `${bad.word} isn't a word.` };

  const score = words.reduce((s, w) => s + w.score, 0) + (tiles.length === RACK_SIZE ? BINGO_BONUS : 0);
  return { ok: true, tiles, words, score };
}

function hasNeighbour(at: (r: number, c: number) => string, t: Placement, dr: number, dc: number) {
  return !!(at(t.row - dr, t.col - dc) || at(t.row + dr, t.col + dc));
}

export function applyMove(board: Board, tiles: Placement[]) {
  for (const t of tiles) board[t.row][t.col] = t.letter;
}

// ---- Finding every play --------------------------------------------------------------
// The classic Appel-Jacobson method: from each "anchor" square (an empty square next
// to a tile), build words through the letter tree, only trying letters that also make
// valid words crossing each square.

const ALL = (1 << 26) - 1;

/** Every legal play for this rack, scored, best first. */
export function findMoves(board: Board, rack: string[]): ScoredMove[] {
  const found = new Map<string, ScoredMove>();
  const record = (tiles: Placement[]) => {
    const key = tiles
      .map((t) => `${t.row},${t.col},${t.letter}`)
      .sort()
      .join('|');
    if (found.has(key)) return;
    const check = checkMove(board, rack, tiles);
    if (check.ok) found.set(key, { tiles: check.tiles, words: check.words, score: check.score });
  };
  for (const transposed of [false, true]) {
    const get = (r: number, c: number) => (transposed ? board[c][r] : board[r][c]);
    const toPlacement = (r: number, c: number, l: string): Placement => (transposed ? { row: c, col: r, letter: l } : { row: r, col: c, letter: l });
    searchLines(get, toPlacement, rack, isEmptyBoard(board), record);
  }
  return [...found.values()].sort((a, b) => b.score - a.score);
}

function searchLines(
  get: (r: number, c: number) => string,
  toPlacement: (r: number, c: number, l: string) => Placement,
  rack: string[],
  empty: boolean,
  record: (tiles: Placement[]) => void,
) {
  const counts = new Array<number>(26).fill(0);
  for (const l of rack) counts[l.charCodeAt(0) - 65]++;
  const filled = (r: number, c: number) => inside(r, c) && !!get(r, c);

  for (let r = 0; r < SIZE; r++) {
    // Which letters can go in each empty square of this row without spoiling the word crossing it.
    const cross = new Array<number>(SIZE).fill(ALL);
    const anchor = new Array<boolean>(SIZE).fill(false);
    for (let c = 0; c < SIZE; c++) {
      if (filled(r, c)) continue;
      anchor[c] = empty ? r === CENTER && c === CENTER : filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1);
      if (!filled(r - 1, c) && !filled(r + 1, c)) continue;
      let above = '';
      for (let rr = r - 1; filled(rr, c); rr--) above = get(rr, c) + above;
      let below = '';
      for (let rr = r + 1; filled(rr, c); rr++) below += get(rr, c);
      let mask = 0;
      for (let k = 0; k < 26; k++) if (isWord(above + String.fromCharCode(65 + k) + below)) mask |= 1 << k;
      cross[c] = mask;
    }

    /** Rack letters placed left of the anchor (in order), and tiles placed from the anchor rightwards. */
    const leftLetters: number[] = [];
    const right: Placement[] = [];
    const tilesNow = (anchorCol: number) => [
      ...leftLetters.map((k, i) => toPlacement(r, anchorCol - leftLetters.length + i, String.fromCharCode(65 + k))),
      ...right,
    ];
    const extendRight = (node: number, c: number, anchorCol: number) => {
      if (c >= SIZE || !filled(r, c)) {
        if (isEnd(node) && c > anchorCol) {
          const tiles = tilesNow(anchorCol);
          if (tiles.length > 0) record(tiles);
        }
        if (c >= SIZE) return;
        eachChild(node, (k, n) => {
          if (counts[k] === 0 || !(cross[c] & (1 << k))) return;
          counts[k]--;
          right.push(toPlacement(r, c, String.fromCharCode(65 + k)));
          extendRight(n, c + 1, anchorCol);
          right.pop();
          counts[k]++;
        });
      } else {
        const n = child(node, get(r, c).charCodeAt(0) - 65);
        if (n !== -1) extendRight(n, c + 1, anchorCol);
      }
    };
    /** Every run of rack letters (up to `limit`) to the left of the anchor, each then extended right. */
    const leftPart = (node: number, limit: number, anchorCol: number) => {
      extendRight(node, anchorCol, anchorCol);
      if (limit === 0) return;
      eachChild(node, (k, n) => {
        if (counts[k] === 0) return;
        counts[k]--;
        leftLetters.push(k);
        leftPart(n, limit - 1, anchorCol);
        leftLetters.pop();
        counts[k]++;
      });
    };

    for (let c = 0; c < SIZE; c++) {
      if (!anchor[c]) continue;
      if (filled(r, c - 1)) {
        // Existing letters to the left are the start of the word.
        let start = c - 1;
        while (filled(r, start - 1)) start--;
        let node = ROOT;
        for (let cc = start; cc < c && node !== -1; cc++) node = child(node, get(r, cc).charCodeAt(0) - 65);
        if (node !== -1) extendRight(node, c, c);
      } else {
        // Room to the left: empty squares that aren't anchors themselves.
        let limit = 0;
        for (let cc = c - 1; cc >= 0 && !filled(r, cc) && !anchor[cc]; cc--) limit++;
        leftPart(ROOT, Math.min(limit, RACK_SIZE - 1), c);
      }
    }
  }
}

// ---- Making puzzles ----------------------------------------------------------------------

/** How many of each letter in the bag (the familiar English mix, without blanks). */
const BAG: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export interface Puzzle {
  board: Board;
  rack: string[];
  best: ScoredMove;
}

/**
 * A board part way through a game, plus a rack for everyone to play. The board is
 * built by playing a few random sensible moves (with familiar words only), and the
 * rack is dealt from what's left until it has a decent play.
 */
export function makePuzzle(): Puzzle {
  for (let attempt = 0; ; attempt++) {
    const board = emptyBoard();
    const bag = shuffle(Object.entries(BAG).flatMap(([l, n]) => Array<string>(n).fill(l)));
    const moves = 4 + Math.floor(Math.random() * 3);
    for (let m = 0; m < moves; m++) {
      const rack = bag.splice(0, RACK_SIZE);
      const options = findMoves(board, rack).filter((mv) => mv.words.every((w) => isBoardWord(w.word)) && mv.tiles.length >= 2);
      if (options.length === 0) {
        bag.push(...rack);
        shuffle(bag);
        continue;
      }
      // Something good but not always the best, so boards vary.
      const pick = options[Math.floor(Math.random() * Math.min(options.length, Math.max(3, options.length / 3)))];
      applyMove(board, pick.tiles);
      const used = [...rack];
      for (const t of pick.tiles) used.splice(used.indexOf(t.letter), 1);
      bag.push(...used);
      shuffle(bag);
    }
    const tilesOnBoard = board.flat().filter(Boolean).length;
    if (tilesOnBoard < 10 && attempt < 20) continue;

    // Deal a playable rack: a sensible number of vowels and a play worth making.
    for (let deal = 0; deal < 30; deal++) {
      shuffle(bag);
      const rack = bag.slice(0, RACK_SIZE);
      const vowels = rack.filter((l) => VOWELS.has(l)).length;
      if (vowels < 2 || vowels > 4) continue;
      const best = findMoves(board, rack)[0];
      if (best && best.score >= 15) return { board, rack, best };
    }
  }
}
