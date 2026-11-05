import { Circle, Edge, World, type Body } from 'planck';
import {
  AIM_MS,
  BALL_R,
  BALLS,
  GUTTER_HALF,
  HEAD_PIN_Y,
  LANE_HALF,
  LANE_LEN,
  MAX_ANGLE,
  PIN_R,
  PIN_SPOTS,
  RELEASE_Y,
  STRIKE_ZONE,
  ballSpeed,
  FRAMES,
  frameScores,
  toBoard,
  type BowlAim,
  type BowlBoardState,
  type BowlInput,
  type BowlPlayerState,
  type Frame,
  type PinView,
} from '../../shared/games/strikeZone';
import type { Recording } from '../../shared/volleys';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { Recorder } from './recorder';
import { VolleyGame } from './volleys';

const STEP = 1 / 120;
const FPS = 25;
const MIN_ROLL_S = 1;
const MAX_ROLL_S = 6;
/** Masses (kg) as densities for their circles. */
const BALL_DENSITY = 7 / (Math.PI * BALL_R * BALL_R);
const PIN_DENSITY = 1.5 / (Math.PI * PIN_R * PIN_R);
/** Spin pushes the ball sideways this hard (m/s² at full spin) on its way up the lane. */
const HOOK = 0.6;
/** A pin moved this far from its spot is down. */
const DOWN_MOVE = 0.08;
const BALL_ID = 100;

interface Pin {
  id: number;
  body: Body | null;
  spot: { x: number; y: number };
  down: boolean;
}

export interface Lane {
  world: World;
  pins: Pin[];
  frames: Frame[];
  /** Volleys started so far (this one's frame and ball follow from it). */
  volley: number;
  shot: Recording | null;
}

const frameOf = (l: Lane) => Math.min(FRAMES - 1, Math.floor(Math.max(0, l.volley) / 2));
const ballOf = (l: Lane) => Math.max(0, l.volley) - frameOf(l) * 2;

export function newLane(): Lane {
  const world = new World({ gravity: { x: 0, y: 0 } });
  // The gutters' outer walls, and the back of the pit.
  const walls = world.createBody();
  walls.createFixture(new Edge({ x: -GUTTER_HALF, y: -1 }, { x: -GUTTER_HALF, y: LANE_LEN + 1 }), { restitution: 0.3 });
  walls.createFixture(new Edge({ x: GUTTER_HALF, y: -1 }, { x: GUTTER_HALF, y: LANE_LEN + 1 }), { restitution: 0.3 });
  return { world, pins: [], frames: Array.from({ length: FRAMES }, (_, i): Frame => (i === FRAMES - 1 ? [null, null, null] : [null, null])), volley: -1, shot: null };
}

/** Sets all ten pins up on their spots. */
function setPins(l: Lane) {
  for (const p of l.pins) p.body?.setActive(false);
  l.pins = PIN_SPOTS.map((spot, i) => {
    const body = l.world.createDynamicBody({ position: spot, linearDamping: 1.2, angularDamping: 2 });
    body.createFixture(new Circle(PIN_R), { density: PIN_DENSITY, friction: 0.2, restitution: 0.7 });
    return { id: i + 1, body, spot, down: false };
  });
}

/** Clears the pins that went down (between a frame's two balls). */
function sweep(l: Lane) {
  for (const p of l.pins) {
    if (!p.down || !p.body) continue;
    p.body.setActive(false);
    p.body = null;
  }
}

/** Whether all ten go up before this ball: a new frame, or in the last frame after a strike or spare. */
function freshPins(l: Lane) {
  const ball = ballOf(l);
  if (ball === 0) return true;
  if (frameOf(l) !== FRAMES - 1) return false;
  const [a, b] = l.frames[frameOf(l)];
  return ball === 1 ? a === 10 : b === 10 || (a !== 10 && (a ?? 0) + (b ?? 0) === 10);
}

/** Next ball: fresh pins if it's their turn, else the fallen ones are swept away. */
export function nextBall(l: Lane) {
  l.volley++;
  l.shot = null;
  if (freshPins(l)) setPins(l);
  else sweep(l);
}

/** A frame's second ball isn't bowled after a strike; the last frame's third only pays for a strike or spare. */
export function sitsOut(l: Lane) {
  const [a, b] = l.frames[frameOf(l)];
  if (frameOf(l) !== FRAMES - 1) return ballOf(l) === 1 && a === 10;
  return ballOf(l) === 2 && a !== 10 && (a ?? 0) + (b ?? 0) !== 10;
}

function markDown(l: Lane) {
  for (const p of l.pins) {
    if (p.down) continue;
    if (!p.body) {
      p.down = true;
      continue;
    }
    const pos = p.body.getPosition();
    if (Math.hypot(pos.x - p.spot.x, pos.y - p.spot.y) > DOWN_MOVE || Math.abs(pos.x) > LANE_HALF || pos.y > LANE_LEN) p.down = true;
  }
}

/** Bowls a ball and runs the lane until everything's stopped, recording it. Returns pins knocked. */
export function bowl(l: Lane, aim: BowlAim): number {
  const recorder = new Recorder(FPS, 0.6, 0.05);
  const before = l.pins.filter((p) => p.down).length;
  const x = Math.max(-LANE_HALF + BALL_R, Math.min(LANE_HALF - BALL_R, aim.x));
  const ball = l.world.createDynamicBody({ position: { x, y: RELEASE_Y }, linearDamping: 0.04, bullet: true });
  ball.createFixture(new Circle(BALL_R), { density: BALL_DENSITY, friction: 0.1, restitution: 0.2 });
  const angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, aim.angle));
  const speed = ballSpeed(aim.power);
  ball.setLinearVelocity({ x: Math.sin(angle) * speed, y: Math.cos(angle) * speed });
  let ballBody: Body | null = ball;
  let inGutter = false;
  const spin = Math.max(-1, Math.min(1, aim.spin));
  const read = (b: Body | null) => () => {
    if (!b) return null;
    const p = b.getPosition();
    return { ...toBoard(p.x, p.y), a: 0 };
  };
  const things = () => [...l.pins.map((p) => ({ id: p.id, read: read(p.body) })), { id: BALL_ID, read: read(ballBody) }];
  recorder.capture(things());
  const perFrame = Math.round(1 / STEP / FPS);
  for (let step = 1; step * STEP < MAX_ROLL_S; step++) {
    if (ballBody) {
      const p = ballBody.getPosition();
      const v = ballBody.getLinearVelocity();
      // Off the edge of the lane: into the gutter, where it rolls straight on.
      if (!inGutter && Math.abs(p.x) > LANE_HALF) {
        inGutter = true;
        ballBody.setPosition({ x: Math.sign(p.x) * (LANE_HALF + GUTTER_HALF) / 2, y: p.y });
        // It runs past the pins without touching them.
        ballBody.getFixtureList()?.setSensor(true);
      }
      if (inGutter) ballBody.setLinearVelocity({ x: 0, y: v.y });
      // Spin hooks it sideways, more the further it's gone, until it reaches the pins.
      else if (p.y < HEAD_PIN_Y - 0.3) ballBody.applyForceToCenter({ x: spin * HOOK * (0.3 + p.y / HEAD_PIN_Y) * ballBody.getMass(), y: 0 });
    }
    l.world.step(STEP);
    // Into the pit: gone.
    for (const pin of l.pins) {
      if (pin.body && pin.body.getPosition().y > LANE_LEN) {
        pin.body.setActive(false);
        pin.body = null;
        pin.down = true;
      }
    }
    if (ballBody && (ballBody.getPosition().y > LANE_LEN || ballBody.getLinearVelocity().y < 0.05)) {
      ballBody.setActive(false);
      ballBody = null;
    }
    if (step % perFrame === 0) recorder.capture(things());
    if (step * STEP > MIN_ROLL_S && !ballBody && l.pins.every((p) => !p.body || !p.body.isAwake() || p.body.getLinearVelocity().lengthSquared() < 0.0004)) break;
  }
  recorder.capture(things());
  ballBody?.setActive(false);
  markDown(l);
  const knocked = l.pins.filter((p) => p.down).length - before;
  l.frames[frameOf(l)][ballOf(l)] = knocked;
  l.shot = recorder.finish();
  return knocked;
}

export const totalPins = (l: Lane) => frameScores(l.frames).reduce((n, f) => n + f, 0);

class StrikeZone extends VolleyGame<Lane, BowlBoardState, BowlPlayerState, BowlAim> {
  /** Each lane's pins as they stood before this ball (the TV plays the ball from there). */
  private before = new Map<Lane, PinView[]>();

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: BALLS, aimMs: AIM_MS });
  }

  protected newBoard() {
    return newLane();
  }

  protected beforeVolley(l: Lane) {
    nextBall(l);
    this.before.delete(l);
  }

  protected shoots(l: Lane) {
    return !sitsOut(l);
  }

  protected defaultAim(): BowlAim {
    return { x: 0, angle: 0, power: 0.5, spin: 0 };
  }

  protected readAim(raw: unknown): BowlAim | null {
    const input = raw as BowlInput;
    if (input.type !== 'aim' && input.type !== 'fire') return null;
    if (![input.x, input.angle, input.power, input.spin].every(Number.isFinite)) return null;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    return { x: clamp(input.x, -LANE_HALF + BALL_R, LANE_HALF - BALL_R), angle: clamp(input.angle, -MAX_ANGLE, MAX_ANGLE), power: clamp(input.power, 0, 1), spin: clamp(input.spin, -1, 1) };
  }

  protected shoot(shots: { board: Lane; aim: BowlAim }[]) {
    let longest = 0;
    for (const { board, aim } of shots) {
      this.before.set(board, this.pinViews(board));
      bowl(board, aim);
      longest = Math.max(longest, (board.shot!.frames / board.shot!.fps) * 1000);
    }
    return longest;
  }

  private pinViews(l: Lane): PinView[] {
    return l.pins
      .filter((p) => p.body)
      .map((p) => {
        const pos = p.body!.getPosition();
        const b = toBoard(pos.x, pos.y);
        return { id: p.id, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, down: p.down, a: Math.atan2(pos.y - p.spot.y, pos.x - p.spot.x) };
      });
  }

  protected boardScore(l: Lane) {
    return totalPins(l);
  }

  protected hostState(l: Lane, aim: BowlAim): BowlBoardState {
    const before = this.phase === 'fly' ? this.before.get(l) : undefined;
    return {
      pins: before ?? this.pinViews(l),
      aim,
      // While a ball plays, its frame shows as it was before it.
      frames: before ? l.frames.map((f, i) => (i === frameOf(l) ? f.map((p, ball) => (ball < ballOf(l) ? p : null)) : f)) : l.frames,
      frame: frameOf(l),
      ball: ballOf(l),
      sitting: sitsOut(l),
      shot: before ? l.shot : null,
    };
  }

  protected playerState(l: Lane, aim: BowlAim): BowlPlayerState {
    return { aim, frames: l.frames, frame: frameOf(l), ball: ballOf(l), sitting: sitsOut(l), standing: l.pins.filter((p) => p.body && !p.down).length };
  }
}

export const strikeZone: MiniGameDefinition = {
  info: STRIKE_ZONE,
  create: (ctx, _modeId, options) => new StrikeZone(ctx, options.puzzles),
};
