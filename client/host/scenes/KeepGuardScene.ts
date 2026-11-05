import Phaser from 'phaser';
import type { ArenaEntry } from '../../../shared/arena';
import {
  ARENA_R,
  BALL_R,
  BRICK_RINGS,
  BRICKS_PER_RING,
  CENTER,
  CORE_R,
  RUBBLE_R,
  SHIELD_HALF,
  SHIELD_R,
  WORLD,
  keepCenter,
  keepFacing,
  type GuardWorld,
} from '../../../shared/games/keepGuard';
import { FIRE, FLOOR_A, FLOOR_B, FLOOR_DARK, GOLD, INK, STONE, ball, glow, shade } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst, shockwave } from '../fx';
import { hex } from '../theme';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fills the ring segment between radii `inner` and `outer`, from angle `a0` to `a1`. */
function sector(g: Phaser.GameObjects.Graphics, x: number, y: number, inner: number, outer: number, a0: number, a1: number) {
  g.beginPath();
  g.arc(x, y, outer, a0, a1, false);
  g.arc(x, y, inner, a1, a0, true);
  g.closePath();
  g.fillPath();
}

/** The TV during Keep Guard: the round arena, everyone's keep, bricks and shield, and the balls. */
export class KeepGuardScene extends ArenaScene<GuardWorld> {
  static readonly KEY = 'keep-guard';
  protected readonly title = 'KEEP GUARD';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD;
  protected readonly worldH = WORLD;

  constructor() {
    super(KeepGuardScene.KEY);
  }

  protected statusText(p: ArenaEntry) {
    if (p.endedAtMs !== null) return `fell ${Math.floor(p.endedAtMs / 1000)}s`;
    const k = this.curr?.world.keeps.find((o) => o.playerId === p.playerId);
    return k ? `${[...k.bricks].filter((b) => b === '1').length} bricks` : 'in';
  }

  /** Bricks going send up chips of stone; a keep falling sends up a lot more. */
  protected onUpdate(prev: GuardWorld, next: GuardWorld) {
    const n = next.keeps.length;
    next.keeps.forEach((k, i) => {
      const was = prev.keeps[i];
      if (!was) return;
      const { x, y } = keepCenter(i, n);
      const facing = keepFacing(i, n);
      if (was.alive && !k.alive) {
        const at = this.screenOf(x, y);
        burst(this, at.x, at.y, hex(k.color), 60);
        shockwave(this, at.x, at.y, hex(k.color), 200);
      }
      for (let b = 0; b < k.bricks.length; b++) {
        if (was.bricks[b] !== '1' || k.bricks[b] === '1') continue;
        const ring = Math.floor(b / BRICKS_PER_RING);
        const a = facing - Math.PI / 2 + ((b % BRICKS_PER_RING) + 0.5) * (Math.PI / BRICKS_PER_RING);
        const r = (BRICK_RINGS[ring][0] + BRICK_RINGS[ring][1]) / 2;
        const at = this.screenOf(x + Math.cos(a) * r, y + Math.sin(a) * r);
        burst(this, at.x, at.y, 0xc8bfff, 12);
      }
    });
  }

  /** The arena floor, with faint rings. */
  protected drawStatic(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, WORLD, WORLD);
    for (let r = ARENA_R, i = 0; r > 0; r -= 80, i++) g.fillStyle(i % 2 ? FLOOR_A : FLOOR_B, 1).fillCircle(CENTER, CENTER, r);
    g.lineStyle(16, INK, 1).strokeCircle(CENTER, CENTER, ARENA_R);
    g.lineStyle(8, 0x8b7cf6, 1).strokeCircle(CENTER, CENTER, ARENA_R);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: GuardWorld, curr: GuardWorld, t: number, time: number) {
    const n = curr.keeps.length;
    const step = Math.PI / BRICKS_PER_RING;
    curr.keeps.forEach((k, i) => {
      const { x, y } = keepCenter(i, n);
      const facing = keepFacing(i, n);
      const color = hex(k.color);
      if (!k.alive) {
        g.fillStyle(INK, 1).fillCircle(x, y, RUBBLE_R + 4);
        g.fillStyle(shade(STONE, -0.3), 1).fillCircle(x, y, RUBBLE_R);
        for (let j = 0; j < 7; j++) ball(g, x + Math.cos(facing + (j - 3) * 0.4) * RUBBLE_R * 0.6, y + Math.sin(facing + (j - 3) * 0.4) * RUBBLE_R * 0.6, 17, STONE);
        return;
      }
      // Bricks, ring by ring.
      BRICK_RINGS.forEach(([inner, outer], r) => {
        for (let b = 0; b < BRICKS_PER_RING; b++) {
          if (k.bricks[r * BRICKS_PER_RING + b] !== '1') continue;
          const a0 = facing - Math.PI / 2 + b * step;
          g.fillStyle(INK, 1);
          sector(g, x, y, inner - 2, outer + 2, a0, a0 + step);
          g.fillStyle(r ? 0xc8bfff : 0x9d92e0, 1);
          sector(g, x, y, inner + 2, outer - 2, a0 + 0.03, a0 + step - 0.03);
          g.fillStyle(0xffffff, 0.3);
          sector(g, x, y, outer - 8, outer - 3, a0 + 0.06, a0 + step - 0.06);
        }
      });
      // The keep itself, in their colour, with a little crown.
      ball(g, x, y, CORE_R, color);
      const cx = x + Math.cos(facing) * CORE_R * 0.35;
      const cy = y + Math.sin(facing) * CORE_R * 0.35;
      ball(g, cx, cy, 13, GOLD);
      // The shield, eased between updates.
      const was = prev.keeps[i];
      const shield = facing + (was && was.alive ? lerp(was.shield, k.shield, t) : k.shield);
      g.lineStyle(24, INK, 1);
      g.beginPath();
      g.arc(x, y, SHIELD_R, shield - SHIELD_HALF - 0.02, shield + SHIELD_HALF + 0.02, false);
      g.strokePath();
      g.lineStyle(15, color, 1);
      g.beginPath();
      g.arc(x, y, SHIELD_R, shield - SHIELD_HALF, shield + SHIELD_HALF, false);
      g.strokePath();
      g.lineStyle(4, shade(color, 0.5), 1);
      g.beginPath();
      g.arc(x, y, SHIELD_R + 4, shield - SHIELD_HALF + 0.03, shield + SHIELD_HALF - 0.03, false);
      g.strokePath();
    });
    for (const b of curr.balls) {
      const was = prev.balls.find((o) => o.id === b.id);
      // A big jump means it bounced off a fallen keep's rubble; don't slide through.
      const near = was && Math.hypot(was.x - b.x, was.y - b.y) < 80;
      const x = near ? lerp(was.x, b.x, t) : b.x;
      const y = near ? lerp(was.y, b.y, t) : b.y;
      glow(g, x, y, BALL_R * (3.4 + 0.3 * Math.sin(time / 90)), b.hot ? FIRE : 0xffffff);
      ball(g, x, y, BALL_R, b.hot ? FIRE : 0xffffff);
    }
  }
}
