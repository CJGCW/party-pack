import Phaser from 'phaser';
import { BALL_R, CENTER, RADIUS, WORLD, type RingWorld } from '../../../shared/games/bumpRing';
import { ArenaScene } from '../arenaScene';
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
    for (const b of next.balls) if (!b.on && prev.balls.find((o) => o.playerId === b.playerId)?.on) this.fellAt.set(b.playerId, performance.now());
  }

  /** The drop below: dark water. */
  protected drawStatic(g: Phaser.GameObjects.Graphics) {
    this.fellAt.clear();
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, WORLD, WORLD);
    g.lineStyle(2, 0x5ec8f2, 0.06);
    for (let r = 60; r < WORLD; r += 60) g.strokeCircle(CENTER, CENTER, r);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: RingWorld, curr: RingWorld, t: number, time: number) {
    // The platform: what's left of it, and a red rim once it's crumbling.
    const radius = lerp(prev.radius, curr.radius, t);
    g.fillStyle(0x3b3185, 1).fillCircle(CENTER, CENTER, radius);
    g.fillStyle(0x4a3f9a, 1).fillCircle(CENTER, CENTER, radius * 0.85);
    g.lineStyle(10, radius < RADIUS ? 0xff5d73 : 0x8b7cf6, radius < RADIUS ? 0.6 + 0.3 * Math.sin(time / 120) : 1).strokeCircle(CENTER, CENTER, radius);
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
      g.fillStyle(0x000000, 0.3).fillCircle(x + 6, y + 10, size);
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, size + 5);
      g.fillStyle(color, 1).fillCircle(x, y, size);
      g.fillStyle(0xffffff, 0.45).fillCircle(x - size * 0.35, y - size * 0.35, size * 0.3);
    }
  }
}
