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
import { ArenaScene } from '../arenaScene';
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

  /** The arena floor, with faint rings. */
  protected drawStatic(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, WORLD, WORLD);
    g.fillStyle(0x2a2160, 1).fillCircle(CENTER, CENTER, ARENA_R);
    g.lineStyle(2, 0x8b7cf6, 0.12);
    for (let r = 80; r < ARENA_R; r += 80) g.strokeCircle(CENTER, CENTER, r);
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
        g.fillStyle(0x140f2e, 1).fillCircle(x, y, RUBBLE_R + 4);
        g.fillStyle(0x4a4470, 1).fillCircle(x, y, RUBBLE_R);
        g.fillStyle(0x5e5888, 1);
        for (let j = 0; j < 7; j++) g.fillCircle(x + Math.cos(facing + (j - 3) * 0.4) * RUBBLE_R * 0.6, y + Math.sin(facing + (j - 3) * 0.4) * RUBBLE_R * 0.6, 18);
        return;
      }
      // Bricks, ring by ring.
      BRICK_RINGS.forEach(([inner, outer], r) => {
        for (let b = 0; b < BRICKS_PER_RING; b++) {
          if (k.bricks[r * BRICKS_PER_RING + b] !== '1') continue;
          const a0 = facing - Math.PI / 2 + b * step;
          g.fillStyle(0x140f2e, 1);
          sector(g, x, y, inner - 2, outer + 2, a0, a0 + step);
          g.fillStyle(r ? 0xc8bfff : 0x9d92e0, 1);
          sector(g, x, y, inner + 2, outer - 2, a0 + 0.03, a0 + step - 0.03);
        }
      });
      // The keep itself, in their colour, with a little crown.
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, CORE_R + 5);
      g.fillStyle(color, 1).fillCircle(x, y, CORE_R);
      const cx = x + Math.cos(facing) * CORE_R * 0.35;
      const cy = y + Math.sin(facing) * CORE_R * 0.35;
      g.fillStyle(0xffd166, 1).fillCircle(cx, cy, 14);
      // The shield, eased between updates.
      const was = prev.keeps[i];
      const shield = facing + (was && was.alive ? lerp(was.shield, k.shield, t) : k.shield);
      g.lineStyle(22, 0x140f2e, 1);
      g.beginPath();
      g.arc(x, y, SHIELD_R, shield - SHIELD_HALF - 0.02, shield + SHIELD_HALF + 0.02, false);
      g.strokePath();
      g.lineStyle(14, color, 1);
      g.beginPath();
      g.arc(x, y, SHIELD_R, shield - SHIELD_HALF, shield + SHIELD_HALF, false);
      g.strokePath();
    });
    for (const b of curr.balls) {
      const was = prev.balls.find((o) => o.id === b.id);
      // A big jump means it bounced off a fallen keep's rubble; don't slide through.
      const near = was && Math.hypot(was.x - b.x, was.y - b.y) < 80;
      const x = near ? lerp(was.x, b.x, t) : b.x;
      const y = near ? lerp(was.y, b.y, t) : b.y;
      g.fillStyle(0xffffff, 0.15 + 0.05 * Math.sin(time / 90)).fillCircle(x, y, BALL_R * 2);
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, BALL_R + 3);
      g.fillStyle(b.hot ? 0xffa62b : 0xffffff, 1).fillCircle(x, y, BALL_R);
    }
  }
}
