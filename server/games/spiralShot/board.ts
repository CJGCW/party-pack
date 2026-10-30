import {
  BALL_D,
  BOARD_SIZE,
  CENTER,
  COLORS,
  SHOT_SPEED,
  START_HEAD,
  TURRET_R,
  aimVector,
  trackPoint,
  type Track,
} from '../../../shared/games/spiralShot';

/** A gap pulls shut at this speed when the marbles either side of it match. */
const PULL_SPEED = 320;
/** Marbles this close (centre to centre) are touching. */
const TOUCHING = BALL_D + 0.5;
/** A shot hits a marble when it gets this close to it. */
const HIT_DIST = BALL_D * 0.9;
/** Shots move in steps this small, so they can't skip through a marble. */
const SHOT_STEP = 10;
/** The same colour twice in a row in the chain this often (never three). */
const REPEAT_CHANCE = 0.35;

export interface Marble {
  id: number;
  /** Distance along the track. */
  s: number;
  color: number;
}

interface Shot {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: number;
}

/** A small seeded random number generator (mulberry32), so every board gets the same chain. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One player's board: the chain rolling round the track and their turret's shots. The chain is
 * kept head first (furthest along first). Only the back of the chain is pushed along: marbles
 * touching it get pushed too, and anything past a gap waits, unless the marbles either side of the
 * gap match, when the front part rolls back to join up (and pops again if that makes three).
 */
export class Board {
  chain: Marble[] = [];
  shots: Shot[] = [];
  angle = 0;
  current: number;
  next: number;
  pops = 0;
  bestCombo = 0;
  out = false;
  private nextId = 1;
  private sinceShot = 0;
  /** Chain reactions: how many pops in a row this one is part of. */
  private combo = 0;

  constructor(
    /** The round's track. */
    readonly track: Track,
    /** The chain's colours, shared by every board in the round. */
    private readonly chainRandom: () => number,
    /** This board's own turret colours. */
    private readonly shotRandom: () => number,
  ) {
    // The chain starts part of the way along, packed tight.
    for (let s = track.length * START_HEAD; s >= 0; s -= BALL_D) this.chain.push(this.newMarble(s));
    this.current = this.pickShotColor();
    this.next = this.pickShotColor();
  }

  private newMarble(s: number): Marble {
    const back = this.chain[this.chain.length - 1];
    const before = this.chain[this.chain.length - 2];
    let color: number;
    if (back && this.chainRandom() < REPEAT_CHANCE && !(before && before.color === back.color)) color = back.color;
    else {
      const others = COLORS.map((_, i) => i).filter((i) => i !== back?.color);
      color = others[Math.floor(this.chainRandom() * others.length)];
    }
    return { id: this.nextId++, s, color };
  }

  /** The turret only gets colours still in the chain (any, if it's empty). */
  private pickShotColor() {
    const present = [...new Set(this.chain.map((m) => m.color))];
    const pool = present.length ? present : COLORS.map((_, i) => i);
    return pool[Math.floor(this.shotRandom() * pool.length)];
  }

  swap() {
    [this.current, this.next] = [this.next, this.current];
  }

  /** Moves everything on by `dt` seconds, with the chain rolling at `speed`. Returns true if the chain reached the hole. */
  step(dt: number, speed: number, fireMs: number) {
    if (this.out) return false;
    this.rollChain(dt, speed);
    this.pullGaps(dt);
    this.feedChain();
    this.moveShots(dt);
    this.sinceShot += dt * 1000;
    if (this.sinceShot >= fireMs) {
      this.sinceShot -= fireMs;
      this.fire();
    }
    if (this.chain.length && this.chain[0].s >= this.track.length) this.out = true;
    return this.out;
  }

  /** Pushes the back of the chain along, and anything it's touching. */
  private rollChain(dt: number, speed: number) {
    if (!this.chain.length) return;
    this.chain[this.chain.length - 1].s += speed * dt;
    this.closeUp();
  }

  /** Marbles never overlap: each pushes the one in front of it on if they're closer than touching. */
  private closeUp() {
    const c = this.chain;
    for (let i = c.length - 2; i >= 0; i--) if (c[i].s < c[i + 1].s + BALL_D) c[i].s = c[i + 1].s + BALL_D;
  }

  /** Gaps with matching marbles either side pull shut, which can pop them. */
  private pullGaps(dt: number) {
    const c = this.chain;
    for (let i = 0; i < c.length - 1; i++) {
      const gap = c[i].s - c[i + 1].s;
      if (gap <= TOUCHING || c[i].color !== c[i + 1].color) continue;
      // Roll the part in front (from the gap up to the next gap ahead) back.
      let front = i;
      while (front > 0 && c[front - 1].s - c[front].s <= TOUCHING) front--;
      const back = Math.min(PULL_SPEED * dt, gap - BALL_D);
      for (let j = front; j <= i; j++) c[j].s -= back;
      // Joined up: three or more pops again, one more in the chain reaction.
      if (c[i].s - c[i + 1].s <= TOUCHING && this.popAround(i, this.combo + 1)) return;
    }
  }

  /**
   * New marbles come out of the tunnel behind the chain. If the back of the chain popped, they
   * come out at the entrance and roll up behind it (pushing it once they reach it).
   */
  private feedChain() {
    const back = this.chain[this.chain.length - 1];
    if (!back) return void this.chain.push(this.newMarble(0));
    if (back.s >= 0) this.chain.push(this.newMarble(Math.min(back.s - BALL_D, 0)));
  }

  private fire() {
    const v = aimVector(this.angle);
    this.shots.push({
      id: this.nextId++,
      x: CENTER.x + v.x * TURRET_R,
      y: CENTER.y + v.y * TURRET_R,
      dx: v.x,
      dy: v.y,
      color: this.current,
    });
    this.current = this.next;
    this.next = this.pickShotColor();
  }

  private moveShots(dt: number) {
    const travel = SHOT_SPEED * dt;
    const steps = Math.ceil(travel / SHOT_STEP);
    for (const shot of [...this.shots]) {
      for (let k = 0; k < steps; k++) {
        shot.x += (shot.dx * travel) / steps;
        shot.y += (shot.dy * travel) / steps;
        const hit = this.hitMarble(shot);
        if (hit >= 0) {
          this.shots.splice(this.shots.indexOf(shot), 1);
          this.land(shot, hit);
          break;
        }
        if (shot.x < -BALL_D || shot.y < -BALL_D || shot.x > BOARD_SIZE + BALL_D || shot.y > BOARD_SIZE + BALL_D) {
          this.shots.splice(this.shots.indexOf(shot), 1);
          break;
        }
      }
    }
  }

  /** The marble a shot's touching (the nearest), or -1. Marbles still in the tunnel can't be hit. */
  private hitMarble(shot: Shot) {
    let best = -1;
    let bestDist = HIT_DIST;
    this.chain.forEach((m, i) => {
      if (m.s < 0) return;
      const p = trackPoint(this.track, m.s);
      const d = Math.hypot(p.x - shot.x, p.y - shot.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  /** A shot joins the chain beside the marble it hit (in front or behind, whichever side it hit). */
  private land(shot: Shot, hit: number) {
    const m = this.chain[hit];
    const here = trackPoint(this.track, m.s);
    const ahead = trackPoint(this.track, m.s + 1);
    const inFront = (shot.x - here.x) * (ahead.x - here.x) + (shot.y - here.y) * (ahead.y - here.y) > 0;
    const at = inFront ? hit : hit + 1;
    // It takes the place in front of the marble it hit, or that marble's place (pushing it on).
    this.chain.splice(at, 0, { id: shot.id, s: inFront ? m.s + BALL_D : m.s, color: shot.color });
    this.closeUp();
    this.combo = 0;
    this.popAround(at, 1);
  }

  /** Pops the run of touching same-coloured marbles around `i` if there are three or more, as pop `combo` of a chain reaction. */
  private popAround(i: number, combo: number) {
    const c = this.chain;
    if (!c[i]) return false;
    const color = c[i].color;
    let from = i;
    let to = i;
    while (from > 0 && c[from - 1].color === color && c[from - 1].s - c[from].s <= TOUCHING) from--;
    while (to < c.length - 1 && c[to + 1].color === color && c[to].s - c[to + 1].s <= TOUCHING) to++;
    if (to - from + 1 < 3) return false;
    c.splice(from, to - from + 1);
    this.pops += to - from + 1;
    this.combo = combo;
    this.bestCombo = Math.max(this.bestCombo, combo);
    // The turret's marbles must still be in the chain; swap any that aren't.
    const present = new Set(c.map((m) => m.color));
    if (present.size && !present.has(this.current)) this.current = this.pickShotColor();
    if (present.size && !present.has(this.next)) this.next = this.pickShotColor();
    return true;
  }
}
