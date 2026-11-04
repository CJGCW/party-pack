import type { GameInfo } from '../protocol';

export const COPY_CAT: GameInfo = {
  id: 'copy-cat',
  name: 'Copy Cat',
  description: 'Take turns leading: move your phone (tilt it, swing it about) for a few seconds. Everyone else watches it on the TV, then copies it as closely as they can. Copiers score for how close they get; the leader scores for a move some can copy but not everyone.',
  minPlayers: 2,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Everyone leads once a round.' }],
};

// Turns go round. A move is a trace: how the phone's tilted (two numbers, -1 to 1) TRACE_HZ times
// a second for MOVE_MS (or, without motion sensors, where a finger is on a pad). Copies are
// compared with the leader's by dynamic time warping, so a copy that's a little quicker or
// slower in places still matches.

export const MOVE_MS = 4_000;
export const TRACE_HZ = 20;
/** The leader has this long to record their move; then everyone watches it, then copies. */
export const LEAD_MS = 20_000;
export const SHOW_MS = MOVE_MS + 1_500;
export const COPY_MS = 20_000;
export const SCORE_MS = 5_000;
/** The leader scores most (LEADER_MAX) when about half copy it well (SIMILAR or better). */
export const SIMILAR = 60;
export const LEADER_MAX = 200;

/** A trace: x, y pairs. */
export type Trace = number[];

/** How alike two traces are, 0 to 100 (dynamic time warping, each point matched to its best partner in order). */
export function similarity(a: Trace, b: Trace) {
  const n = a.length / 2;
  const m = b.length / 2;
  if (n < 2 || m < 2) return 0;
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  cost[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = Math.hypot(a[i * 2 - 2] - b[j * 2 - 2], a[i * 2 - 1] - b[j * 2 - 1]);
      cost[i][j] = d + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1]);
    }
  }
  const average = cost[n][m] / (n + m);
  return Math.max(0, Math.round(100 * (1 - average * 2.2)));
}

/** The leader's points: most when about half the copiers got it. */
export const leaderPoints = (good: number, copiers: number) => (copiers ? Math.round(LEADER_MAX * 4 * (good / copiers) * (1 - good / copiers)) : 0);

export type CopyPhase = 'lead' | 'show' | 'copy' | 'score' | 'result' | 'gameEnd';

export interface CopyPlayer {
  id: string;
  name: string;
  color: string;
  /** Recorded their copy this turn; at the score, how close it was. */
  done: boolean;
  match: number | null;
  turnPoints: number;
  roundPoints: number;
  points: number;
  gamePoints: number;
}

export interface CopyView {
  phase: CopyPhase;
  puzzleNumber: number;
  totalPuzzles: number;
  turn: number;
  turns: number;
  leader: string;
  /** From the show on: the leader's move; at the score, everyone's copies. */
  move: Trace | null;
  copies: Record<string, Trace>;
  players: CopyPlayer[];
  msLeft: number;
  you?: string;
}

export type CopyInput = { type: 'trace'; trace: Trace };
