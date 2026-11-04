import { Box, Circle, Edge, Polygon, World, type Body } from 'planck';
import {
  AIM_MS,
  BLOCK_POINTS,
  CASTLE_CRUSH,
  GRAVITY,
  GUARD_POINTS,
  HILL,
  KNOCK_MOVE,
  KNOCK_TURN,
  LAUNCH,
  MAX_ELEVATION,
  MIN_ELEVATION,
  PX,
  SHOTS,
  STONE_R,
  WORLD_W,
  launchSpeed,
  toBoard,
  type CastleAim,
  type CastleBoardState,
  type CastleInput,
  type CastlePlayerState,
  type Piece,
} from '../../shared/games/castleCrush';
import type { Recording } from '../../shared/volleys';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { Recorder } from './recorder';
import { seededRandom } from './spiralShot/board';
import { VolleyGame } from './volleys';

const STEP = 1 / 60;
/** Recorded at this many frames a second (every few physics steps). */
const FPS = 20;
/** A shot runs until everything's settled (at least this long), or this long at most. */
const MIN_SHOT_S = 1.2;
const MAX_SHOT_S = 8;
/** A guard hit at least this hard (an impulse, kg·m/s) topples. */
const GUARD_HIT = 2.2;
/** Castle parts (metres). */
const BAY = 3.2;
const BAY_GAP = 1.1;
const PILLAR = { hw: 0.2, hh: 0.9 };
const SLAB_HH = 0.17;
const GUARD_R = 0.4;
/** How heavy things are (kg per square metre): the stone's heavy, but not so heavy one shot brings the lot down. */
const STONE_DENSITY = 3;
const BLOCK_DENSITY = 1.5;

interface Part {
  id: number;
  kind: Piece['kind'];
  hw: number;
  hh: number;
  body: Body | null;
  home: { x: number; y: number; a: number };
  down: boolean;
}

export interface Castle {
  world: World;
  parts: Part[];
  nextId: number;
  shotsLeft: number;
  shot: Recording | null;
  /** Guards hit hard enough during this shot (they topple at its end, or as they're hit). */
  live: boolean;
}

function addPart(c: Castle, kind: Part['kind'], x: number, y: number, hw: number, hh: number): Part {
  const body = c.world.createDynamicBody({ position: { x, y } });
  if (kind === 'guard' || kind === 'stone') body.createFixture(new Circle(hw), { density: kind === 'stone' ? STONE_DENSITY : 0.6, friction: 0.6, restitution: 0.1 });
  else body.createFixture(new Box(hw, hh), { density: BLOCK_DENSITY, friction: 0.7, restitution: 0.05 });
  // Guards stand rather than roll (a round one would roll off the slightest tilt).
  if (kind === 'guard') body.setFixedRotation(true);
  const part: Part = { id: c.nextId++, kind, hw, hh, body, home: { x, y, a: 0 }, down: false };
  body.setUserData(part);
  c.parts.push(part);
  return part;
}

/** Everyone's castle: the same from the seed. A few bays of pillars and slabs, up to three high, with guards inside and on top. */
export function newCastle(seed: number): Castle {
  const random = seededRandom(seed);
  const world = new World({ gravity: { x: 0, y: -GRAVITY } });
  world.createBody().createFixture(new Edge({ x: -20, y: 0 }, { x: WORLD_W + 20, y: 0 }), { friction: 0.8 });
  world.createBody().createFixture(new Polygon(HILL.map(([x, y]) => ({ x, y }))), { friction: 0.8 });
  const c: Castle = { world, parts: [], nextId: 1, shotsLeft: SHOTS, shot: null, live: false };
  const bays = 3 + Math.floor(random() * 2);
  const left = WORLD_W - 1.5 - bays * BAY - (bays - 1) * BAY_GAP;
  const heights = Array.from({ length: bays }, () => 2 + Math.floor(random() * 2));
  heights[Math.floor(random() * bays)] = 4;
  const level = PILLAR.hh * 2 + SLAB_HH * 2;
  heights.forEach((h, b) => {
    const x0 = left + b * (BAY + BAY_GAP);
    for (let l = 0; l < h; l++) {
      const base = l * level;
      addPart(c, 'block', x0 + PILLAR.hw + 0.05, base + PILLAR.hh, PILLAR.hw, PILLAR.hh);
      addPart(c, 'block', x0 + BAY - PILLAR.hw - 0.05, base + PILLAR.hh, PILLAR.hw, PILLAR.hh);
      addPart(c, 'slab', x0 + BAY / 2, base + PILLAR.hh * 2 + SLAB_HH, BAY / 2, SLAB_HH);
      // A guard on the ground floor of every bay, and now and then on the floors above.
      if (l === 0 || random() < 0.4) addPart(c, 'guard', x0 + BAY / 2, base + GUARD_R, GUARD_R, GUARD_R);
    }
    // On top: a guard on the tallest, a little turret on others now and then.
    const top = h * level;
    if (h === 4) addPart(c, 'guard', x0 + BAY / 2, top + GUARD_R, GUARD_R, GUARD_R);
    else if (random() < 0.5) {
      addPart(c, 'block', x0 + BAY / 2 - 0.6, top + 0.4, 0.25, 0.4);
      addPart(c, 'block', x0 + BAY / 2 + 0.6, top + 0.4, 0.25, 0.4);
    }
  });
  // Let it settle, then that's where everything stands.
  for (let i = 0; i < 120; i++) world.step(STEP);
  for (const p of c.parts) {
    const pos = p.body!.getPosition();
    p.home = { x: pos.x, y: pos.y, a: p.body!.getAngle() };
  }
  // Guards topple when something hits them hard.
  world.on('post-solve', (contact, impulse) => {
    if (!c.live || Math.max(...impulse.normalImpulses) < GUARD_HIT) return;
    for (const f of [contact.getFixtureA(), contact.getFixtureB()]) {
      const part = f.getBody().getUserData() as Part | null;
      if (part?.kind === 'guard') part.down = true;
    }
  });
  return c;
}

/** Marks blocks knocked from where they stood, and guards moved off their spot. */
function check(c: Castle) {
  for (const p of c.parts) {
    if (p.down || !p.body || p.kind === 'stone') continue;
    const pos = p.body.getPosition();
    const moved = Math.hypot(pos.x - p.home.x, pos.y - p.home.y);
    if (pos.y < -1 || moved > KNOCK_MOVE * (p.kind === 'guard' ? 1.5 : 1) || (p.kind !== 'guard' && Math.abs(p.body.getAngle() - p.home.a) > KNOCK_TURN)) p.down = true;
  }
}

const boardAt = (p: Part) => {
  if (!p.body) return null;
  const pos = p.body.getPosition();
  const b = toBoard(pos.x, pos.y);
  return { x: b.x, y: b.y, a: -p.body.getAngle() };
};

/** Fires a stone and runs the world until it settles, recording it. Toppled guards vanish as they fall. */
export function fireAt(c: Castle, aim: CastleAim): Recording {
  const recorder = new Recorder(FPS);
  c.live = true;
  c.shotsLeft--;
  const stone = addPart(c, 'stone', LAUNCH.x, LAUNCH.y, STONE_R, STONE_R);
  const v = launchSpeed(aim.power);
  stone.body!.setLinearVelocity({ x: Math.cos(aim.elevation) * v, y: Math.sin(aim.elevation) * v });
  stone.body!.setBullet(true);
  const things = () => c.parts.map((p) => ({ id: p.id, read: () => boardAt(p) }));
  recorder.capture(things());
  const perFrame = Math.round(1 / STEP / FPS);
  for (let step = 1; step * STEP < MAX_SHOT_S; step++) {
    c.world.step(STEP);
    check(c);
    // A toppled guard pops; a stone that's flown off the board is gone.
    for (const p of c.parts) {
      if (!p.body) continue;
      const pos = p.body.getPosition();
      if ((p.kind === 'guard' && p.down) || pos.x > WORLD_W + 6 || pos.x < -6 || pos.y < -6) {
        if (p.kind === 'guard') p.down = true;
        // Switched off rather than destroyed: planck can trip over a body destroyed while it's mid-collision.
        p.body.setActive(false);
        p.body = null;
      }
    }
    if (step % perFrame === 0) recorder.capture(things());
    if (step * STEP >= MIN_SHOT_S && c.parts.every((p) => !p.body || !p.body.isAwake())) break;
  }
  recorder.capture(things());
  c.live = false;
  check(c);
  // The stone's done with: off the board for the next shot.
  stone.body?.setActive(false);
  stone.body = null;
  c.parts = c.parts.filter((p) => p !== stone);
  c.shot = recorder.finish();
  return c.shot;
}

export const knocked = (c: Castle) => c.parts.filter((p) => p.kind !== 'guard' && p.down).length;
export const guardsDown = (c: Castle) => c.parts.filter((p) => p.kind === 'guard' && p.down).length;
export const damage = (c: Castle) => knocked(c) * BLOCK_POINTS + guardsDown(c) * GUARD_POINTS;

class CastleCrush extends VolleyGame<Castle, CastleBoardState, CastlePlayerState, CastleAim> {
  /** Each board as it stood before this volley's shot: the TV plays the shot from there, and shows its counts till it's done. */
  private before = new Map<Castle, { pieces: Piece[]; knocked: number; guardsDown: number }>();

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: SHOTS, aimMs: AIM_MS });
  }

  protected newBoard(seed: number) {
    return newCastle(seed);
  }

  protected defaultAim(): CastleAim {
    return { elevation: 0.6, power: 0.6 };
  }

  protected readAim(raw: unknown): CastleAim | null {
    const input = raw as CastleInput;
    if ((input.type !== 'aim' && input.type !== 'fire') || !Number.isFinite(input.elevation) || !Number.isFinite(input.power)) return null;
    return { elevation: Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, input.elevation)), power: Math.max(0, Math.min(1, input.power)) };
  }

  protected shoot(shots: { board: Castle; aim: CastleAim }[]) {
    // Before this volley's shots, each board shows where things stand (the pieces); the shot plays over that.
    let longest = 0;
    for (const { board, aim } of shots) {
      board.shot = null;
      const before = { pieces: this.pieces(board), knocked: knocked(board), guardsDown: guardsDown(board) };
      const rec = fireAt(board, aim);
      board.shot = rec;
      this.before.set(board, before);
      longest = Math.max(longest, (rec.frames / rec.fps) * 1000);
    }
    return longest;
  }

  private pieces(c: Castle): Piece[] {
    return c.parts
      .filter((p) => p.body)
      .map((p) => {
        const at = boardAt(p)!;
        return { id: p.id, kind: p.kind, hw: p.hw * PX, hh: p.hh * PX, x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, a: Math.round(at.a * 1000) / 1000, down: p.down };
      });
  }

  protected boardScore(c: Castle) {
    return damage(c);
  }

  protected hostState(c: Castle, aim: CastleAim): CastleBoardState {
    const before = this.phase === 'fly' && c.shot ? this.before.get(c) : undefined;
    return {
      pieces: before?.pieces ?? this.pieces(c),
      aim,
      shotsLeft: c.shotsLeft,
      knocked: before?.knocked ?? knocked(c),
      guardsDown: before?.guardsDown ?? guardsDown(c),
      guards: c.parts.filter((p) => p.kind === 'guard').length,
      shot: before ? c.shot : null,
    };
  }

  protected playerState(c: Castle, aim: CastleAim): CastlePlayerState {
    return { aim, shotsLeft: c.shotsLeft, knocked: knocked(c), guardsDown: guardsDown(c), guards: c.parts.filter((p) => p.kind === 'guard').length };
  }
}

export const castleCrush: MiniGameDefinition = {
  info: CASTLE_CRUSH,
  create: (ctx, _modeId, options) => new CastleCrush(ctx, options.puzzles),
};
