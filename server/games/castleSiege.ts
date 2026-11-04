import { survivalPoints } from '../../shared/boards';
import {
  CASTLE_SIEGE,
  COLS,
  CYCLES,
  FIRE_MS,
  PIECES,
  RELOAD_MS,
  REPAIR_MS,
  RING,
  ROWS,
  SHELL_MS,
  castleOf,
  landOf,
  piecesFor,
  turned,
  type SiegeInput,
  type SiegePhase,
  type SiegeView,
} from '../../shared/games/castleSiege';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

interface Shell {
  from: { x: number; y: number };
  x: number;
  y: number;
  landsAt: number;
}

interface Lord {
  index: number;
  out: boolean;
  outAt: number | null;
  /** Which piece of the round's sequence is next, and how it's turned. */
  next: number;
  turns: number;
  reloadAt: number;
}

/** -1 for no wall, else the owner's index. */
export type Walls = number[][];

/** Everyone's castle with a ring of wall round it. */
export function startWalls(n: number): Walls {
  const walls = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(-1));
  for (let i = 0; i < n; i++) {
    const c = castleOf(i, n);
    for (let y = c.y - RING; y <= c.y + 1 + RING; y++) {
      for (let x = c.x - RING; x <= c.x + 1 + RING; x++) {
        const edge = y === c.y - RING || y === c.y + 1 + RING || x === c.x - RING || x === c.x + 1 + RING;
        if (edge && walls[y]?.[x] !== undefined) walls[y][x] = i;
      }
    }
  }
  return walls;
}

const isCastle = (i: number, n: number, x: number, y: number) => {
  const c = castleOf(i, n);
  return x >= c.x && x <= c.x + 1 && y >= c.y && y <= c.y + 1;
};

/**
 * Is player `i`'s castle walled in? Fills in from the edge of their land through everything that
 * isn't wall: if that reaches the castle, it isn't. Returns how much land's walled in (0 if not).
 */
export function enclosure(walls: Walls, i: number, n: number): number {
  const land = landOf(i, n);
  const inLand = (x: number, y: number) => x >= land.x && x < land.x + land.w && y >= land.y && y < land.y + land.h;
  const seen = new Set<number>();
  const todo: [number, number][] = [];
  for (let x = land.x; x < land.x + land.w; x++) for (const y of [land.y, land.y + land.h - 1]) todo.push([x, y]);
  for (let y = land.y; y < land.y + land.h; y++) for (const x of [land.x, land.x + land.w - 1]) todo.push([x, y]);
  while (todo.length) {
    const [x, y] = todo.pop()!;
    const k = y * COLS + x;
    if (!inLand(x, y) || seen.has(k) || walls[y][x] >= 0) continue;
    if (isCastle(i, n, x, y)) return 0;
    seen.add(k);
    todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  let walled = 0;
  for (let y = land.y; y < land.y + land.h; y++) for (let x = land.x; x < land.x + land.w; x++) if (walls[y][x] < 0 && !seen.has(y * COLS + x)) walled++;
  return walled;
}

/** A shell lands: it knocks out the wall it hits and next to it (a plus). */
export function blast(walls: Walls, x: number, y: number) {
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (walls[y + dy]?.[x + dx] !== undefined) walls[y + dy][x + dx] = -1;
  }
}

/** Places a piece for player `i` with its first cell at (x, y), if it all fits in their land on open ground. */
export function placePiece(walls: Walls, i: number, n: number, piece: number, turns: number, x: number, y: number) {
  const land = landOf(i, n);
  const cells = turned(PIECES[piece], turns).map(([dx, dy]) => [x + dx, y + dy]);
  const fits = cells.every(([cx, cy]) => cx >= land.x && cx < land.x + land.w && cy >= land.y && cy < land.y + land.h && walls[cy][cx] < 0 && !isCastle(i, n, cx, cy));
  if (!fits) return false;
  for (const [cx, cy] of cells) walls[cy][cx] = i;
  return true;
}

export class CastleSiege implements MiniGame {
  private phase: SiegePhase = 'fire';
  private puzzleIndex = 0;
  private cycle = 0;
  private walls: Walls = [];
  private pieces: number[] = [];
  private lords = new Map<string, Lord>();
  private shells: Shell[] = [];
  private roundStartedAt = 0;
  private points = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private shellTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalPuzzles: number,
  ) {}

  private get count() {
    return Math.min(4, this.lords.size);
  }

  start() {
    this.startPuzzle(0);
  }

  private setPhase(phase: SiegePhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startPuzzle(index: number) {
    this.puzzleIndex = index;
    const players = this.ctx.players().slice(0, 4);
    this.lords = new Map(players.map((p, i) => [p.id, { index: i, out: false, outAt: null, next: 0, turns: 0, reloadAt: 0 }]));
    this.walls = startWalls(this.count);
    this.pieces = piecesFor(Math.floor(Math.random() * 2 ** 31));
    this.points.clear();
    this.roundStartedAt = Date.now();
    this.cycle = 0;
    this.startFire();
  }

  private live() {
    return [...this.lords.values()].filter((l) => !l.out);
  }

  private startFire() {
    this.shells = [];
    this.setPhase('fire', FIRE_MS, () => this.startRepair());
  }

  private startRepair() {
    // Shells still in the air land first.
    for (const s of this.shells) blast(this.walls, s.x, s.y);
    this.shells = [];
    this.setPhase('repair', REPAIR_MS, () => this.endRepair());
  }

  private endRepair() {
    const now = Date.now();
    for (const l of this.live()) {
      if (enclosure(this.walls, l.index, this.count) > 0) continue;
      l.out = true;
      l.outAt = now - this.roundStartedAt;
    }
    this.cycle++;
    if (this.live().length <= 1 || this.cycle >= CYCLES) return this.endPuzzle();
    this.startFire();
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as SiegeInput;
    const lord = this.lords.get(playerId);
    if (!lord || lord.out || !input) return;
    const now = Date.now();
    if (input.type === 'fire' && this.phase === 'fire' && now >= lord.reloadAt && Number.isInteger(input.x) && Number.isInteger(input.y)) {
      // Only at rivals' land, and only at a rival still in.
      const target = [...this.lords.values()].find((o) => {
        const land = landOf(o.index, this.count);
        return input.x >= land.x && input.x < land.x + land.w && input.y >= land.y && input.y < land.y + land.h;
      });
      if (!target || target === lord || target.out) return;
      lord.reloadAt = now + RELOAD_MS;
      const c = castleOf(lord.index, this.count);
      this.shells.push({ from: { x: c.x + 1, y: c.y + 1 }, x: input.x, y: input.y, landsAt: now + SHELL_MS });
      this.scheduleShells();
      this.syncAll();
    } else if (input.type === 'turn' && this.phase === 'repair') {
      lord.turns = (lord.turns + 1) % 4;
      this.syncPlayer(playerId);
    } else if (input.type === 'place' && this.phase === 'repair' && Number.isInteger(input.x) && Number.isInteger(input.y)) {
      if (!placePiece(this.walls, lord.index, this.count, this.pieces[lord.next % this.pieces.length], lord.turns, input.x, input.y)) return;
      lord.next++;
      this.syncAll();
    }
  }

  /** Lands shells as their time comes. */
  private scheduleShells() {
    if (this.shellTimer) return;
    const next = Math.min(...this.shells.map((s) => s.landsAt));
    this.shellTimer = setTimeout(() => {
      this.shellTimer = null;
      const now = Date.now();
      const landed = this.shells.filter((s) => s.landsAt <= now);
      for (const s of landed) blast(this.walls, s.x, s.y);
      this.shells = this.shells.filter((s) => s.landsAt > now);
      if (this.shells.length) this.scheduleShells();
      this.syncAll();
    }, Math.max(0, next - Date.now()));
  }

  private endPuzzle() {
    const roundMs = Date.now() - this.roundStartedAt;
    for (const [id, l] of this.lords) {
      const points = survivalPoints(l.out ? l.outAt : null, roundMs);
      this.points.set(id, points);
      this.gamePoints.set(id, (this.gamePoints.get(id) ?? 0) + points);
      if (points) this.ctx.addScore(id, points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('result', PUZZLE_RESULT_MS, () => {
      if (!isLast) return this.startPuzzle(this.puzzleIndex + 1);
      if (this.totalPuzzles === 1) return this.ctx.finish();
      this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private view(forId?: string): SiegeView {
    const now = Date.now();
    const lord = forId ? this.lords.get(forId) : undefined;
    return {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      cycle: this.cycle + 1,
      walls: this.walls.map((row) => row.map((v) => (v < 0 ? '.' : String(v))).join('')).join(''),
      shells: this.shells.flatMap((s) => [s.from.x, s.from.y, s.x, s.y, Math.max(0, s.landsAt - now)]),
      players: this.ctx
        .players()
        .filter((p) => this.lords.has(p.id))
        .map((p) => {
          const l = this.lords.get(p.id)!;
          return { id: p.id, name: p.name, color: p.color, index: l.index, out: l.out, enclosed: l.out ? 0 : enclosure(this.walls, l.index, this.count), points: this.points.get(p.id) ?? 0, gamePoints: this.gamePoints.get(p.id) ?? 0 };
        }),
      msLeft: Math.max(0, this.phaseEndsAt - now),
      ...(forId ? { you: forId, piece: lord ? this.pieces[lord.next % this.pieces.length] : undefined, turns: lord?.turns, reloadMs: lord ? Math.max(0, lord.reloadAt - now) : undefined } : {}),
    };
  }

  syncHost() {
    this.ctx.sendHost(this.view());
  }

  syncPlayer(playerId: string) {
    this.ctx.sendPlayer(playerId, this.view(playerId));
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.shellTimer) clearTimeout(this.shellTimer);
    this.timer = this.shellTimer = null;
  }
}

export const castleSiege: MiniGameDefinition = {
  info: CASTLE_SIEGE,
  create: (ctx, _modeId, options) => new CastleSiege(ctx, options.puzzles),
};
