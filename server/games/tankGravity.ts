import {
  AIM_MS,
  BLAST_DAMAGE,
  BLAST_R,
  DIRECT_HIT,
  FLIGHT_S,
  GRAVITY_UI,
  HP,
  SPACE_H,
  SPACE_W,
  TANK_R,
  VOLLEYS,
  pull,
  shellSpeed,
  type GravityAim,
  type GravityInput,
  type GravityPlayerState,
  type GravityRound,
  type GravityTankView,
  type Planet,
} from '../../shared/games/tankGravity';
import type { GameContext, MiniGame } from './MiniGame';
import { Recorder } from './recorder';
import { seededRandom } from './spiralShot/board';
import { VolleyGame } from './volleys';

const STEP = 1 / 120;
const FPS = 30;
const PLANET_COLORS = [0x8b7cf6, 0x5ec8f2, 0xff9f43, 0x4cd37a];

export interface GravityTank {
  index: number;
  x: number;
  y: number;
  up: number;
  hp: number;
  /** Its hit points before this volley (shown while the shells fly). */
  hpBefore: number;
  dealt: number;
}

/** A bit of space: a few planets, spread out, from the seed. */
export function makePlanets(seed: number): Planet[] {
  const random = seededRandom(seed);
  const planets: Planet[] = [];
  const count = 3 + Math.floor(random() * 2);
  for (let tries = 0; planets.length < count && tries < 500; tries++) {
    const r = 55 + random() * 55;
    const x = 200 + random() * (SPACE_W - 400);
    const y = 170 + random() * (SPACE_H - 340);
    if (planets.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 170)) continue;
    planets.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), color: PLANET_COLORS[planets.length % PLANET_COLORS.length] });
  }
  return planets;
}

/** Where tank `i` of `n` sits: round the planets in turn, spread round each. */
export function placeTank(planets: Planet[], i: number, n: number): GravityTank {
  const planet = planets[i % planets.length];
  const onThis = Math.ceil((n - (i % planets.length)) / planets.length);
  const k = Math.floor(i / planets.length);
  const up = -Math.PI / 2 + (k * Math.PI * 2) / Math.max(1, onThis) + (i % planets.length) * 0.9;
  return { index: i, x: planet.x + Math.cos(up) * (planet.r + TANK_R * 0.8), y: planet.y + Math.sin(up) * (planet.r + TANK_R * 0.8), up, hp: HP, hpBefore: HP, dealt: 0 };
}

/**
 * Fires every live tank's shell at once and flies them together, recording it. Shells burst on a
 * planet or a tank; blasts hurt every tank near them. Returns the recording and the blasts.
 */
export function volley(planets: Planet[], tanks: GravityTank[], aims: Map<GravityTank, GravityAim>) {
  const recorder = new Recorder(FPS, 0.5, 10);
  const shells = [...aims].map(([tank, aim], i) => {
    const v = shellSpeed(aim.power);
    return { id: i + 1, owner: tank, x: tank.x + Math.cos(aim.angle) * (TANK_R + 6), y: tank.y + Math.sin(aim.angle) * (TANK_R + 6), vx: Math.cos(aim.angle) * v, vy: Math.sin(aim.angle) * v, live: true };
  });
  const blasts: number[] = [];
  const hurt = new Map<GravityTank, number>();
  const burst = (shell: (typeof shells)[number], frame: number, hit: GravityTank | null) => {
    shell.live = false;
    blasts.push(frame, Math.round(shell.x), Math.round(shell.y));
    for (const t of tanks) {
      if (t.hp <= 0) continue;
      const d = Math.hypot(t.x - shell.x, t.y - shell.y);
      let damage = d < BLAST_R ? BLAST_DAMAGE * (1 - d / BLAST_R) : 0;
      if (t === hit) damage += DIRECT_HIT;
      if (damage <= 0) continue;
      hurt.set(t, (hurt.get(t) ?? 0) + damage);
      if (t !== shell.owner) shell.owner.dealt += damage;
    }
  };
  const things = () => shells.map((s) => ({ id: s.id, read: () => (s.live ? { x: s.x, y: s.y, a: 0 } : null) }));
  recorder.capture(things());
  const perFrame = Math.round(1 / STEP / FPS);
  let frame = 0;
  for (let step = 1; step * STEP < FLIGHT_S && shells.some((s) => s.live); step++) {
    for (const s of shells) {
      if (!s.live) continue;
      const { ax, ay } = pull(planets, s.x, s.y);
      s.vx += ax * STEP;
      s.vy += ay * STEP;
      s.x += s.vx * STEP;
      s.y += s.vy * STEP;
      const planet = planets.find((p) => Math.hypot(p.x - s.x, p.y - s.y) < p.r);
      // Its own tank can't be hit in the first moment (it starts right by it).
      const tank = tanks.find((t) => t.hp > 0 && Math.hypot(t.x - s.x, t.y - s.y) < TANK_R && (t !== s.owner || step * STEP > 0.15));
      if (planet || tank) burst(s, frame, tank ?? null);
      else if (s.x < -400 || s.x > SPACE_W + 400 || s.y < -400 || s.y > SPACE_H + 400) s.live = false;
    }
    if (step % perFrame === 0) {
      recorder.capture(things());
      frame++;
    }
  }
  recorder.capture(things());
  for (const [t, damage] of hurt) t.hp = Math.max(0, Math.round(t.hp - damage));
  for (const t of tanks) t.dealt = Math.round(t.dealt);
  return { shot: recorder.finish(), blasts };
}

class TankGravity extends VolleyGame<GravityTank, GravityTankView, GravityPlayerState, GravityAim, GravityRound> {
  private planets: Planet[] = [];
  private shot: GravityRound['shot'] = null;
  private blasts: number[] = [];
  /** Every tank this round (they hurt each other, so the volley needs them all). */
  private tanks: GravityTank[] = [];

  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { volleys: VOLLEYS, aimMs: AIM_MS });
  }

  protected beforeRound() {
    this.planets = makePlanets(this.seed);
    this.tanks = [];
    this.shot = null;
    this.blasts = [];
  }

  protected newBoard(_seed: number, index: number) {
    const tank = placeTank(this.planets, index, this.ctx.players().length);
    this.tanks.push(tank);
    return tank;
  }

  protected beforeVolley() {
    this.shot = null;
    this.blasts = [];
  }

  protected shoots(t: GravityTank) {
    return t.hp > 0;
  }

  protected defaultAim(): GravityAim {
    return { angle: -Math.PI / 2, power: 0.5 };
  }

  protected readAim(raw: unknown): GravityAim | null {
    const input = raw as GravityInput;
    if ((input.type !== 'aim' && input.type !== 'fire') || !Number.isFinite(input.angle) || !Number.isFinite(input.power)) return null;
    return { angle: Math.atan2(Math.sin(input.angle), Math.cos(input.angle)), power: Math.max(0, Math.min(1, input.power)) };
  }

  protected shoot(shots: { board: GravityTank; aim: GravityAim }[]) {
    for (const t of this.tanks) t.hpBefore = t.hp;
    const aims = new Map(shots.map((s) => [s.board, s.aim]));
    const { shot, blasts } = volley(this.planets, this.tanks, aims);
    this.shot = shot;
    this.blasts = blasts;
    return (shot.frames / shot.fps) * 1000;
  }

  protected boardScore(t: GravityTank) {
    return t.dealt;
  }

  protected hostState(t: GravityTank, aim: GravityAim): GravityTankView {
    return { x: Math.round(t.x), y: Math.round(t.y), up: t.up, hp: this.phase === 'fly' ? t.hpBefore : t.hp, aim, dealt: t.dealt };
  }

  protected playerState(t: GravityTank, aim: GravityAim): GravityPlayerState {
    return { hp: t.hp, dealt: t.dealt, aim };
  }

  protected roundState(): GravityRound {
    return { planets: this.planets, shot: this.phase === 'fly' ? this.shot : null, blasts: this.phase === 'fly' ? this.blasts : [] };
  }

  protected viewExtras() {
    return { asGame: GRAVITY_UI };
  }
}

export const createTankGravity = (ctx: GameContext, totalPuzzles: number): MiniGame => new TankGravity(ctx, totalPuzzles);
