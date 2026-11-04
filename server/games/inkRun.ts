import { Box, Circle } from 'planck';
import { toWorld } from '../../shared/physPuzzle';
import { INK, INK_LEVELS, INK_RUN, MAX_POINTS, ROUND_MS, STROKE_HALF, type InkInput, type InkState } from '../../shared/games/inkRun';
import type { Recording } from '../../shared/volleys';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { buildPuzzle, pieceViews, release, simulate, type Puzzle } from './physPuzzle';

/** Strokes are heavy, so the ball runs up them rather than shoving them aside. */
const STROKE_DENSITY = 4;

export interface Ink {
  level: number;
  puzzle: Puzzle;
  /** The strokes drawn this try (world metres), kept so a retry can put them back. */
  strokes: [number, number][][];
  inkLeft: number;
  runs: number;
  solved: boolean;
  moveId: number;
  shot: Recording | null;
  before: InkState['pieces'] | null;
  refused: string;
}

const strokeLength = (pts: [number, number][]) => pts.slice(1).reduce((n, [x, y], i) => n + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

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

/** Adds a stroke as a solid thing (a box along each segment, a dot at each bend), and returns it. */
function addStroke(ink: Ink, pts: [number, number][]) {
  const p = ink.puzzle;
  const [ox, oy] = pts[0];
  const body = p.world.createDynamicBody({ position: { x: ox, y: oy } });
  const polys: [number, number][][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = [pts[i - 1][0] - ox, pts[i - 1][1] - oy];
    const [bx, by] = [pts[i][0] - ox, pts[i][1] - oy];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.01) continue;
    const angle = Math.atan2(by - ay, bx - ax);
    body.createFixture(new Box(len / 2, STROKE_HALF, { x: (ax + bx) / 2, y: (ay + by) / 2 }, angle), { density: STROKE_DENSITY, friction: 0.7 });
    body.createFixture(new Circle({ x: bx, y: by }, STROKE_HALF), { density: STROKE_DENSITY, friction: 0.7 });
    const [nx, ny] = [-Math.sin(angle) * STROKE_HALF, Math.cos(angle) * STROKE_HALF];
    polys.push([
      [ax + nx, ay + ny],
      [bx + nx, by + ny],
      [bx - nx, by - ny],
      [ax - nx, ay - ny],
    ]);
  }
  p.pieces.push({ id: p.nextId++, kind: 'stroke', body, r: 0, polys });
}

/** A fresh try: the level as it starts, with these strokes put back (settled, not shown). */
function rebuild(ink: Ink, strokes: [number, number][][]) {
  ink.puzzle = buildPuzzle(INK_LEVELS[ink.level]);
  ink.strokes = [];
  ink.inkLeft = INK;
  for (const s of strokes) {
    addStroke(ink, s);
    ink.strokes.push(s);
    ink.inkLeft -= strokeLength(s);
  }
  if (strokes.length) simulate(ink.puzzle, 4, false);
}

export function newInk(level: number): Ink {
  const at = level % INK_LEVELS.length;
  return { level: at, puzzle: buildPuzzle(INK_LEVELS[at]), strokes: [], inkLeft: INK, runs: 0, solved: false, moveId: 0, shot: null, before: null, refused: '' };
}

/** Draws a stroke (world metres): refused if it runs through the ground or the ball, or there isn't the ink. */
export function draw(ink: Ink, raw: [number, number][]): boolean {
  const pts = raw.slice(0, MAX_POINTS).filter(([x, y], i, a) => i === 0 || Math.hypot(x - a[i - 1][0], y - a[i - 1][1]) > 0.05);
  ink.refused = '';
  if (pts.length < 2) return false;
  const length = strokeLength(pts);
  if (length > ink.inkLeft + 0.05) {
    ink.refused = 'Not enough ink left. Tap Clear to start again.';
    return false;
  }
  const level = INK_LEVELS[ink.level];
  const ball = ink.puzzle.pieces[0].body.getPosition();
  // Check along the stroke (every few centimetres).
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      if (level.ground.some((g) => inside(g, x, y)) || y < 0.05) {
        ink.refused = "You can't draw through the ground.";
        return false;
      }
      if (Math.hypot(x - ball.x, y - ball.y) < level.ball.r + STROKE_HALF + 0.03) {
        ink.refused = "You can't draw through the ball.";
        return false;
      }
    }
  }
  ink.before = pieceViews(ink.puzzle);
  addStroke(ink, pts);
  ink.strokes.push(pts);
  ink.inkLeft -= length;
  ink.shot = simulate(ink.puzzle, 4, false).shot;
  ink.moveId++;
  return true;
}

/** Lets the ball go. Returns true if it reaches the flag. */
export function run(ink: Ink): boolean {
  if (ink.puzzle.pieces[0].body.isDynamic()) return false;
  ink.before = pieceViews(ink.puzzle);
  ink.runs++;
  const { shot, reached } = release(ink.puzzle);
  ink.shot = shot;
  ink.solved = reached;
  ink.moveId++;
  return reached;
}

/** Back to the start: the same strokes (retry), or none (clear). */
export function restart(ink: Ink, keepStrokes: boolean) {
  rebuild(ink, keepStrokes ? ink.strokes : []);
  ink.shot = null;
  ink.before = null;
  ink.refused = '';
  ink.moveId++;
}

class InkRun extends BoardsGame<Ink, InkState, InkState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: 0 });
  }

  protected newBoard() {
    return newInk(this.puzzleIndex);
  }

  protected boardInput(ink: Ink, raw: unknown) {
    const input = raw as InkInput;
    if (this.phase !== 'play' || !input) return false;
    // Once the ball's been let go, only a retry or a clear.
    const released = ink.puzzle.pieces[0].body.isDynamic();
    if (input.type === 'stroke' && !released && Array.isArray(input.points) && input.points.every(Number.isFinite)) {
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < input.points.length && pts.length < MAX_POINTS; i += 2) {
        const w = toWorld(input.points[i], input.points[i + 1]);
        pts.push([w.x, w.y]);
      }
      draw(ink, pts);
      return true;
    }
    if (input.type === 'run' && !released) return run(ink) ? 'ended' : true;
    if (input.type === 'retry' || input.type === 'clear') {
      restart(ink, input.type === 'retry');
      return true;
    }
    return false;
  }

  protected boardProgress(ink: Ink) {
    return ink.solved ? 1 : 0;
  }

  protected boardScore(ink: Ink) {
    return ink.runs;
  }

  protected hostState(ink: Ink): InkState {
    return {
      level: ink.level,
      pieces: pieceViews(ink.puzzle),
      shot: ink.shot,
      before: ink.before,
      moveId: ink.moveId,
      runs: ink.runs,
      released: ink.puzzle.pieces[0].body.isDynamic(),
      solved: ink.solved,
      inkLeft: Math.max(0, Math.round(ink.inkLeft * 10) / 10),
      refused: ink.refused,
    };
  }

  protected playerState(ink: Ink) {
    return this.hostState(ink);
  }
}

export const inkRun: MiniGameDefinition = {
  info: INK_RUN,
  create: (ctx, _modeId, options) => new InkRun(ctx, options.puzzles),
};
