import { Box, Edge, World, type Body } from 'planck';
import {
  IDOL_TOWER,
  LEVELS,
  PX,
  RESET_MS,
  ROUND_MS,
  toBoard,
  type BlockKind,
  type BlockView,
  type TowerInput,
  type TowerState,
} from '../../shared/games/idolTower';
import type { Recording } from '../../shared/volleys';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { Recorder } from './recorder';

const STEP = 1 / 60;
const FPS = 20;
const MAX_SETTLE_S = 5;
/** The idol this close to the ground counts as touching it. */
const GROUND_TOUCH = 0.05;

interface Block {
  id: number;
  kind: BlockKind;
  hw: number;
  hh: number;
  body: Body | null;
}

export interface Tower {
  level: number;
  world: World;
  blocks: Block[];
  removable: number;
  falls: number;
  fell: boolean;
  lockedUntil: number;
  moveId: number;
  shot: Recording | null;
  before: BlockView[] | null;
}

/** Builds a level's tower (and lets it settle). */
function build(t: Tower) {
  const world = new World({ gravity: { x: 0, y: -10 } });
  world.createBody().createFixture(new Edge({ x: -20, y: 0 }, { x: 30, y: 0 }), { friction: 0.8 });
  t.world = world;
  t.blocks = LEVELS[t.level].blocks.map((b, i) => {
    const body = b.fixed ? world.createBody({ position: { x: b.x, y: b.y } }) : world.createDynamicBody({ position: { x: b.x, y: b.y } });
    body.createFixture(new Box(b.hw, b.hh), { density: b.kind === 'stone' ? 3 : b.kind === 'idol' ? 2 : 1, friction: 0.7, restitution: 0 });
    return { id: i + 1, kind: b.kind, hw: b.hw, hh: b.hh, body };
  });
  t.removable = t.blocks.filter((b) => b.kind === 'wood').length;
  for (let i = 0; i < 60; i++) world.step(STEP);
}

export function newTower(level: number): Tower {
  const t: Tower = { level: level % LEVELS.length, world: new World(), blocks: [], removable: 0, falls: 0, fell: false, lockedUntil: 0, moveId: 0, shot: null, before: null };
  build(t);
  return t;
}

export const woodLeft = (t: Tower) => t.blocks.filter((b) => b.kind === 'wood' && b.body).length;

function views(t: Tower): BlockView[] {
  return t.blocks
    .filter((b) => b.body)
    .map((b) => {
      const pos = b.body!.getPosition();
      const at = toBoard(pos.x, pos.y);
      return { id: b.id, kind: b.kind, hw: b.hw * PX, hh: b.hh * PX, x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, a: Math.round(-b.body!.getAngle() * 1000) / 1000 };
    });
}

/** Is the idol on the ground (or off the bottom of the world)? */
function idolDown(t: Tower) {
  const idol = t.blocks.find((b) => b.kind === 'idol')?.body;
  if (!idol) return true;
  // Its lowest corner.
  const pos = idol.getPosition();
  const a = idol.getAngle();
  const b = t.blocks.find((x) => x.kind === 'idol')!;
  const lowest = pos.y - Math.abs(Math.sin(a)) * b.hw - Math.abs(Math.cos(a)) * b.hh;
  return lowest < GROUND_TOUCH;
}

/**
 * Knocks out a wooden block and lets the tower settle, recording it. Returns 'fell' if the idol hit
 * the ground (the tower resets), 'cleared' if that was the last wooden block, else 'ok' (or null
 * if it isn't a block you can tap).
 */
export function knockOut(t: Tower, id: number): 'ok' | 'fell' | 'cleared' | null {
  const block = t.blocks.find((b) => b.id === id);
  if (!block || block.kind !== 'wood' || !block.body) return null;
  t.moveId++;
  t.before = views(t);
  const recorder = new Recorder(FPS, 1, 0.02);
  const things = () => t.blocks.map((b) => ({ id: b.id, read: () => (b.body ? (({ x, y }) => ({ ...toBoard(x, y), a: -b.body!.getAngle() }))(b.body.getPosition()) : null) }));
  block.body.setActive(false);
  block.body = null;
  recorder.capture(things());
  // Wake everything: something resting on it now has nothing under it.
  for (const b of t.blocks) b.body?.setAwake(true);
  const perFrame = Math.round(1 / STEP / FPS);
  let fell = false;
  for (let step = 1; step * STEP < MAX_SETTLE_S; step++) {
    t.world.step(STEP);
    if (step % perFrame === 0) recorder.capture(things());
    if (idolDown(t)) fell = true;
    if (step > 20 && t.blocks.every((b) => !b.body || !b.body.isAwake())) break;
  }
  recorder.capture(things());
  t.shot = recorder.finish();
  if (fell) return 'fell';
  return woodLeft(t) === 0 ? 'cleared' : 'ok';
}

/** After the idol falls: the tower back as it started. */
export function reset(t: Tower) {
  build(t);
}

class IdolTower extends BoardsGame<Tower, TowerState, TowerState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'race', tickHz: 0 });
  }

  protected newBoard() {
    return newTower(this.puzzleIndex);
  }

  protected boardInput(t: Tower, raw: unknown) {
    const input = raw as TowerInput;
    if (input.type !== 'tap' || this.phase !== 'play' || !Number.isInteger(input.id) || Date.now() < t.lockedUntil) return false;
    const result = knockOut(t, input.id);
    if (!result) return false;
    t.fell = result === 'fell';
    if (result === 'fell') {
      t.falls++;
      t.lockedUntil = Date.now() + RESET_MS;
      // Rebuilt now (the phone and TV show the fall first, then this).
      reset(t);
    }
    return result === 'cleared' ? 'ended' : true;
  }

  protected boardProgress(t: Tower) {
    return t.removable ? 1 - woodLeft(t) / t.removable : 0;
  }

  protected boardScore(t: Tower) {
    return t.removable - woodLeft(t);
  }

  protected hostState(t: Tower): TowerState {
    return {
      blocks: views(t),
      shot: t.shot,
      before: t.before,
      moveId: t.moveId,
      removed: t.removable - woodLeft(t),
      removable: t.removable,
      falls: t.falls,
      fell: t.fell,
      lockedMs: Math.max(0, t.lockedUntil - Date.now()),
      level: LEVELS[t.level].name,
    };
  }

  protected playerState(t: Tower) {
    return this.hostState(t);
  }
}

export const idolTower: MiniGameDefinition = {
  info: IDOL_TOWER,
  create: (ctx, _modeId, options) => new IdolTower(ctx, options.puzzles),
};
