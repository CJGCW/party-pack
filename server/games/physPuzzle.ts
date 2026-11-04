import { Chain, Circle, World, type Body } from 'planck';
import { PX, toBoard, type PieceView, type PuzzleLevel } from '../../shared/physPuzzle';
import type { Recording } from '../../shared/volleys';
import { Recorder } from './recorder';

// The server side of physics puzzles (see shared/physPuzzle.ts): a level's world, the pieces in
// it, and running it (letting things settle, or letting the ball go) with a recording.

export const STEP = 1 / 60;
const FPS = 20;
export const BALL_ID = 1;

export interface Piece {
  id: number;
  kind: PieceView['kind'];
  body: Body;
  r: number;
  /** Outlines in the body's own frame (metres). */
  polys: [number, number][][];
}

export interface Puzzle {
  level: PuzzleLevel;
  world: World;
  pieces: Piece[];
  nextId: number;
}

export function buildPuzzle(level: PuzzleLevel): Puzzle {
  const world = new World({ gravity: { x: 0, y: -10 } });
  for (const outline of level.ground) world.createBody().createFixture(new Chain(outline.map(([x, y]) => ({ x, y })), true), { friction: 0.6 });
  // The edges of the world: walls either side (nothing falls off sideways forever).
  const walls = world.createBody();
  walls.createFixture(new Chain([{ x: -0.05, y: -2 }, { x: -0.05, y: 30 }], false));
  walls.createFixture(new Chain([{ x: 10.05, y: -2 }, { x: 10.05, y: 30 }], false));
  // The ball waits (fixed) until Run.
  const ball = world.createBody({ position: { x: level.ball.x, y: level.ball.y } });
  ball.createFixture(new Circle(level.ball.r), { density: 2, friction: 0.5, restitution: 0.2 });
  return { level, world, pieces: [{ id: BALL_ID, kind: 'ball', body: ball, r: level.ball.r, polys: [] }], nextId: 2 };
}

export function pieceViews(p: Puzzle): PieceView[] {
  return p.pieces.map((piece) => {
    const pos = piece.body.getPosition();
    const at = toBoard(pos.x, pos.y);
    return {
      id: piece.id,
      kind: piece.kind,
      r: piece.r * PX,
      polys: piece.polys.map((poly) => poly.flatMap(([x, y]) => [Math.round(x * PX * 10) / 10, Math.round(-y * PX * 10) / 10])),
      x: Math.round(at.x * 10) / 10,
      y: Math.round(at.y * 10) / 10,
      a: Math.round(-piece.body.getAngle() * 1000) / 1000,
    };
  });
}

/** Is the ball in the goal? */
export function inGoal(p: Puzzle) {
  const pos = p.pieces[0].body.getPosition();
  const g = p.level.goal;
  return pos.x >= g.x && pos.x <= g.x + g.w && pos.y >= g.y && pos.y <= g.y + g.h;
}

/**
 * Runs the world on, recording it, until everything's settled (or `maxS` seconds), calling
 * `each` every step (e.g. fans pushing). Stops early once the ball's in the goal, if `toGoal`.
 * Returns the recording and whether the ball reached the goal.
 */
export function simulate(p: Puzzle, maxS: number, toGoal: boolean, each?: () => void): { shot: Recording; reached: boolean } {
  const recorder = new Recorder(FPS, 1, 0.02);
  const things = () =>
    p.pieces.map((piece) => ({
      id: piece.id,
      read: () => {
        const pos = piece.body.getPosition();
        return pos.y < -3 ? null : { ...toBoard(pos.x, pos.y), a: -piece.body.getAngle() };
      },
    }));
  recorder.capture(things());
  const perFrame = Math.round(1 / STEP / FPS);
  let reached = false;
  for (let step = 1; step * STEP < maxS; step++) {
    each?.();
    p.world.step(STEP);
    if (step % perFrame === 0) recorder.capture(things());
    if (toGoal && inGoal(p)) {
      reached = true;
      // A moment more, to see it arrive.
      for (let k = 0; k < 20; k++) {
        p.world.step(STEP);
        if (k % perFrame === 0) recorder.capture(things());
      }
      break;
    }
    if (step > 30 && p.pieces.every((piece) => !piece.body.isAwake() || !piece.body.isDynamic())) break;
  }
  recorder.capture(things());
  return { shot: recorder.finish(), reached };
}

/** Lets the ball go and runs the level. */
export function release(p: Puzzle, maxS = 10, each?: () => void) {
  const ball = p.pieces[0].body;
  ball.setDynamic();
  ball.setAwake(true);
  return simulate(p, maxS, true, each);
}
