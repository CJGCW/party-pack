import Phaser from 'phaser';
import { BALL_R, CENTER, RADIUS, WORLD, type RingWorld } from '../../../shared/games/bumpRing';
import { DANGER, FLOOR_A, FLOOR_B, FLOOR_DARK, INK, SKY, ball, shade, softShadow } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst, shockwave } from '../fx';
import { hex } from '../theme';

/** A ball falling off shrinks away over this long. */
const FALL_MS = 600;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Bump Ring: the platform (crumbling in late on) and everyone's ball. */
export class BumpRingScene extends ArenaScene<RingWorld> {
  static readonly KEY = 'bump-ring';
  protected readonly title = 'BUMP RING';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD;
  protected readonly worldH = WORLD;
  private fellAt = new Map<string, number>();

  constructor() {
    super(BumpRingScene.KEY);
  }

  protected onUpdate(prev: RingWorld, next: RingWorld) {
    for (const b of next.balls) {
      if (b.on || !prev.balls.find((o) => o.playerId === b.playerId)?.on) continue;
      this.fellAt.set(b.playerId, performance.now());
      const at = this.screenOf(b.x, b.y);
      burst(this, at.x, at.y, SKY, 30);
      shockwave(this, at.x, at.y, SKY, 120);
    }
  }

  /** The drop below: dark water. */
  protected drawStatic(g: Phaser.GameObjects.Graphics) {
    this.fellAt.clear();
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, WORLD, WORLD);
    g.lineStyle(2, SKY, 0.08);
    for (let r = 60; r < WORLD; r += 60) g.strokeCircle(CENTER, CENTER, r);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: RingWorld, curr: RingWorld, t: number, time: number) {
    // The platform: what's left of it, and a red rim once it's crumbling.
    const radius = lerp(prev.radius, curr.radius, t);
    // A thick disc: its side showing below, then the top in rings.
    g.fillStyle(INK, 1).fillCircle(CENTER, CENTER + 18, radius + 6);
    g.fillStyle(shade(FLOOR_B, -0.35), 1).fillCircle(CENTER, CENTER + 16, radius);
    g.fillStyle(INK, 1).fillCircle(CENTER, CENTER, radius + 5);
    for (let i = 0; i < 5; i++) g.fillStyle(i % 2 ? FLOOR_A : FLOOR_B, 1).fillCircle(CENTER, CENTER, radius * (1 - i * 0.18));
    g.lineStyle(10, radius < RADIUS ? DANGER : 0x8b7cf6, radius < RADIUS ? 0.6 + 0.3 * Math.sin(time / 120) : 1).strokeCircle(CENTER, CENTER, radius);
    const now = performance.now();
    for (const b of curr.balls) {
      const was = prev.balls.find((o) => o.playerId === b.playerId);
      const x = was ? lerp(was.x, b.x, t) : b.x;
      const y = was ? lerp(was.y, b.y, t) : b.y;
      let size = BALL_R;
      if (!b.on) {
        const p = (now - (this.fellAt.get(b.playerId) ?? 0)) / FALL_MS;
        if (p >= 1) continue;
        size = BALL_R * (1 - p);
      }
      const color = hex(b.color);
      softShadow(g, x + 4, y + size * 0.85, size * 2, size * 0.9);
      ball(g, x, y, size, color);
    }
  }
}
