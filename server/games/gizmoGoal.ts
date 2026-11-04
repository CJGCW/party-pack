import { Box, Circle } from 'planck';
import { toWorld } from '../../shared/physPuzzle';
import {
  BOUNCER_R,
  FAN_HALF,
  FAN_REACH,
  GIZMO_GOAL,
  GIZMO_LEVELS,
  PLANK_HALF,
  ROUND_MS,
  TURN_STEP,
  type GizmoInput,
  type GizmoState,
  type PartKind,
} from '../../shared/games/gizmoGoal';
import type { Recording } from '../../shared/volleys';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { buildPuzzle, pieceViews, release, type Puzzle } from './physPuzzle';

/** A fan's push, as a share of gravity (so it lifts the ball). */
const FAN_LIFT = 4;

export interface PlacedPart {
  kind: PartKind;
  x: number;
  y: number;
  angle: number;
}

export interface Gizmo {
  level: number;
  puzzle: Puzzle;
  parts: PlacedPart[];
  runs: number;
  solved: boolean;
  moveId: number;
  shot: Recording | null;
  before: GizmoState['pieces'] | null;
  refused: string;
}

/** The level as it starts, with the parts placed. */
function rebuild(g: Gizmo) {
  const p = buildPuzzle(GIZMO_LEVELS[g.level]);
  for (const part of g.parts) {
    const body = p.world.createBody({ position: { x: part.x, y: part.y }, angle: part.angle });
    if (part.kind === 'plank') {
      body.createFixture(new Box(PLANK_HALF.w, PLANK_HALF.h), { friction: 0.4 });
      p.pieces.push({ id: p.nextId++, kind: 'plank', body, r: 0, polys: [[[-PLANK_HALF.w, -PLANK_HALF.h], [PLANK_HALF.w, -PLANK_HALF.h], [PLANK_HALF.w, PLANK_HALF.h], [-PLANK_HALF.w, PLANK_HALF.h]]] });
    } else if (part.kind === 'bouncer') {
      body.createFixture(new Circle(BOUNCER_R), { restitution: 0.95 });
      p.pieces.push({ id: p.nextId++, kind: 'bouncer', body, r: BOUNCER_R, polys: [] });
    } else {
      // A fan's a grate the ball rolls over; its air is worked out in `airOn`.
      body.createFixture(new Box(FAN_HALF, 0.12), { isSensor: true });
      p.pieces.push({ id: p.nextId++, kind: 'fan', body, r: FAN_HALF, polys: [[[-FAN_HALF, -0.12], [FAN_HALF, -0.12], [FAN_HALF, 0.12], [-FAN_HALF, 0.12]]] });
    }
  }
  g.puzzle = p;
}

export function newGizmo(level: number): Gizmo {
  const at = level % GIZMO_LEVELS.length;
  const g: Gizmo = { level: at, puzzle: buildPuzzle(GIZMO_LEVELS[at]), parts: [], runs: 0, solved: false, moveId: 0, shot: null, before: null, refused: '' };
  return g;
}

export function trayLeft(g: Gizmo): Partial<Record<PartKind, number>> {
  const tray = { ...GIZMO_LEVELS[g.level].tray };
  for (const p of g.parts) tray[p.kind] = (tray[p.kind] ?? 0) - 1;
  return tray;
}

/** Is (x, y) inside the outline (world metres)? */
function inside(outline: [number, number][], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Puts a part down (world metres), unless there's none left or it's in the ground or on the ball. */
export function place(g: Gizmo, kind: PartKind, x: number, y: number, angle = 0): boolean {
  g.refused = '';
  if ((trayLeft(g)[kind] ?? 0) <= 0) return false;
  const level = GIZMO_LEVELS[g.level];
  if (x < 0.2 || x > 9.8 || y < 0.1 || y > 5.9 || level.ground.some((o) => inside(o, x, y))) {
    g.refused = "That's in the ground.";
    return false;
  }
  if (Math.hypot(x - level.ball.x, y - level.ball.y) < level.ball.r + 0.45) {
    g.refused = "That's on the ball.";
    return false;
  }
  g.parts.push({ kind, x, y, angle });
  return true;
}

/** Fans push the ball up while it's in the column of air above one. */
function airOn(g: Gizmo) {
  const ball = g.puzzle.pieces[0].body;
  const pos = ball.getPosition();
  for (const part of g.parts) {
    if (part.kind !== 'fan') continue;
    if (Math.abs(pos.x - part.x) < FAN_HALF + 0.1 && pos.y > part.y && pos.y < part.y + FAN_REACH) {
      ball.applyForceToCenter({ x: 0, y: ball.getMass() * 10 * FAN_LIFT });
    }
  }
}

/** Lets the ball go with the parts as placed. Returns true if it reaches the flag. */
export function runGizmo(g: Gizmo): boolean {
  rebuild(g);
  g.before = pieceViews(g.puzzle);
  g.runs++;
  const { shot, reached } = release(g.puzzle, 10, () => airOn(g));
  g.shot = shot;
  g.solved = reached;
  g.moveId++;
  return reached;
}

/** Back to the start, parts and all (so they can be moved). */
function settleView(g: Gizmo) {
  rebuild(g);
  g.shot = null;
  g.before = null;
  g.moveId++;
}

class GizmoGoal extends BoardsGame<Gizmo, GizmoState, GizmoState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: 0 });
  }

  protected newBoard() {
    return newGizmo(this.puzzleIndex);
  }

  protected boardInput(g: Gizmo, raw: unknown) {
    const input = raw as GizmoInput;
    if (this.phase !== 'play' || !input) return false;
    const released = g.puzzle.pieces[0].body.isDynamic();
    // A part's id on the board: the ball's 1, then the parts in order.
    const partAt = (id: number) => (Number.isInteger(id) ? id - 2 : -1);
    if (input.type === 'place' && !released && Number.isFinite(input.x) && Number.isFinite(input.y) && ['plank', 'bouncer', 'fan'].includes(input.part)) {
      const w = toWorld(input.x, input.y);
      if (place(g, input.part, w.x, w.y)) settleView(g);
      return true;
    }
    if ((input.type === 'turn' || input.type === 'remove') && !released) {
      const i = partAt(input.id);
      const part = g.parts[i];
      if (!part) return false;
      if (input.type === 'turn') part.angle = (part.angle + TURN_STEP) % Math.PI;
      else g.parts.splice(i, 1);
      settleView(g);
      return true;
    }
    if (input.type === 'run' && !released) return runGizmo(g) ? 'ended' : true;
    if (input.type === 'retry') {
      settleView(g);
      return true;
    }
    return false;
  }

  protected boardProgress(g: Gizmo) {
    return g.solved ? 1 : 0;
  }

  protected boardScore(g: Gizmo) {
    return g.runs;
  }

  protected hostState(g: Gizmo): GizmoState {
    return {
      level: g.level,
      pieces: pieceViews(g.puzzle),
      shot: g.shot,
      before: g.before,
      moveId: g.moveId,
      runs: g.runs,
      released: g.puzzle.pieces[0].body.isDynamic(),
      solved: g.solved,
      tray: trayLeft(g),
      refused: g.refused,
    };
  }

  protected playerState(g: Gizmo) {
    return this.hostState(g);
  }
}

export const gizmoGoal: MiniGameDefinition = {
  info: GIZMO_GOAL,
  create: (ctx, _modeId, options) => new GizmoGoal(ctx, options.puzzles),
};
