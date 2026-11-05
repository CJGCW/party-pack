import Phaser from 'phaser';
import type { ArenaEntry, ArenaHostView } from '../../../shared/arena';
import { BLOCK, HITS, LAYOUTS, SHELL_R, TANK_R, WORLD_H, WORLD_W, type TankWorld } from '../../../shared/games/tankYard';
import { FIRE, GOLD, INK, STONE, ball, block, checkerFloor, glow, softShadow } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst } from '../fx';
import { hex } from '../theme';

/** A burst grows and fades over this long. */
const BURST_MS = 350;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** The TV during Tank Yard: the walled yard, everyone's tank, shells flying and bursts. */
export class TankYardScene extends ArenaScene<TankWorld> {
  static readonly KEY = 'tank-yard';
  protected readonly title = 'TANK YARD';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD_W;
  protected readonly worldH = WORLD_H;
  private bursts: { x: number; y: number; at: number }[] = [];

  constructor() {
    super(TankYardScene.KEY);
  }

  protected statusText(p: ArenaEntry) {
    if (p.endedAtMs !== null) return `out ${Math.floor(p.endedAtMs / 1000)}s`;
    return '♥'.repeat(Math.max(0, Math.min(HITS, p.score)));
  }

  protected onUpdate(_prev: TankWorld, next: TankWorld) {
    const now = performance.now();
    for (const b of next.bursts) {
      this.bursts.push({ ...b, at: now });
      const at = this.screenOf(b.x, b.y);
      burst(this, at.x, at.y, FIRE, 22);
    }
  }

  /** Dirt, and the yard's walls. */
  protected drawStatic(g: Phaser.GameObjects.Graphics, view: ArenaHostView<TankWorld>) {
    this.bursts = [];
    checkerFloor(g, 0, 0, Math.ceil(WORLD_W / BLOCK), Math.ceil(WORLD_H / BLOCK), BLOCK);
    LAYOUTS[view.world.layout].forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#') return;
        block(g, x * BLOCK, y * BLOCK, BLOCK, BLOCK, STONE);
      }),
    );
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: TankWorld, curr: TankWorld, t: number, time: number) {
    for (const tank of curr.tanks) {
      const was = prev.tanks.find((o) => o.playerId === tank.playerId);
      const x = was ? lerp(was.x, tank.x, t) : tank.x;
      const y = was ? lerp(was.y, tank.y, t) : tank.y;
      const heading = was ? lerpAngle(was.heading, tank.heading, t) : tank.heading;
      if (!tank.alive) {
        // A burnt-out wreck.
        g.fillStyle(0x2a2440, 0.8).fillCircle(x, y, TANK_R * 0.9);
        g.fillStyle(0x140f2e, 0.8).fillCircle(x + 8, y - 6, TANK_R * 0.4);
        continue;
      }
      const alpha = tank.safe ? 0.4 + 0.4 * Math.abs(Math.sin(time / 70)) : 1;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      /** A box `l` long, `w` wide, centred `fwd` ahead of the tank's middle, turned with it. */
      const box = (fwd: number, side: number, l: number, w: number) =>
        [
          [-l / 2, -w / 2],
          [l / 2, -w / 2],
          [l / 2, w / 2],
          [-l / 2, w / 2],
        ].map(([a, b]) => new Phaser.Math.Vector2(x + (a + fwd) * c - (b + side) * s, y + (a + fwd) * s + (b + side) * c));
      softShadow(g, x + 6, y + 10, TANK_R * 2.4, TANK_R * 2, 0.3 * alpha);
      g.fillStyle(INK, alpha).fillPoints(box(0, 0, TANK_R * 2 + 6, TANK_R * 1.7 + 6), true);
      g.fillStyle(0x2a2440, alpha).fillPoints(box(0, -TANK_R * 0.68, TANK_R * 2, TANK_R * 0.36), true);
      g.fillStyle(0x2a2440, alpha).fillPoints(box(0, TANK_R * 0.68, TANK_R * 2, TANK_R * 0.36), true);
      g.fillStyle(hex(tank.color), alpha).fillPoints(box(0, 0, TANK_R * 1.7, TANK_R * 1.0), true);
      g.fillStyle(0x140f2e, alpha).fillPoints(box(TANK_R * 0.75, 0, TANK_R * 1.1, 12), true);
      g.fillStyle(0xdddddd, alpha).fillPoints(box(TANK_R * 0.75, 0, TANK_R * 1.1 - 4, 7), true);
      ball(g, x, y, TANK_R * 0.4, hex(tank.color), alpha);
    }
    for (const sh of curr.shells) {
      const was = prev.shells.find((o) => o.id === sh.id);
      // A bounce in between: don't draw it cutting the corner through the wall.
      const near = was && Math.hypot(was.x - sh.x, was.y - sh.y) < 60;
      const x = near ? lerp(was.x, sh.x, t) : sh.x;
      const y = near ? lerp(was.y, sh.y, t) : sh.y;
      glow(g, x, y, SHELL_R * 3.2, hex(sh.color));
      ball(g, x, y, SHELL_R, hex(sh.color));
    }
    const now = performance.now();
    this.bursts = this.bursts.filter((b) => now - b.at < BURST_MS);
    for (const b of this.bursts) {
      const p = (now - b.at) / BURST_MS;
      glow(g, b.x, b.y, 40 + 50 * p, FIRE, 1 - p);
      g.fillStyle(GOLD, 1 - p).fillCircle(b.x, b.y, 10 + 30 * p);
      g.fillStyle(0xffffff, (1 - p) * 0.8).fillCircle(b.x, b.y, 6 + 14 * p);
    }
  }
}
