import Phaser from 'phaser';
import type { ArenaEntry, ArenaHostView } from '../../../shared/arena';
import { BLOCK, HITS, LAYOUTS, SHELL_R, TANK_R, WORLD_H, WORLD_W, type TankWorld } from '../../../shared/games/tankYard';
import { ArenaScene } from '../arenaScene';
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
    for (const b of next.bursts) this.bursts.push({ ...b, at: now });
  }

  /** Dirt, and the yard's walls. */
  protected drawStatic(g: Phaser.GameObjects.Graphics, view: ArenaHostView<TankWorld>) {
    this.bursts = [];
    g.fillStyle(0x6b5a3e, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    g.fillStyle(0x76644a, 1);
    for (let y = 0; y < WORLD_H; y += BLOCK) for (let x = (y / BLOCK) % 2 ? 0 : BLOCK; x < WORLD_W; x += BLOCK * 2) g.fillRect(x, y, BLOCK, BLOCK);
    LAYOUTS[view.world.layout].forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#') return;
        g.fillStyle(0x3a3350, 1).fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
        g.fillStyle(0x5a527a, 1).fillRect(x * BLOCK + 4, y * BLOCK + 4, BLOCK - 8, BLOCK - 8);
        g.fillStyle(0x6d6496, 1).fillRect(x * BLOCK + 4, y * BLOCK + 4, BLOCK - 8, 14);
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
      g.fillStyle(0x000000, 0.25 * alpha).fillCircle(x + 6, y + 8, TANK_R);
      g.fillStyle(0x140f2e, alpha).fillPoints(box(0, 0, TANK_R * 2 + 6, TANK_R * 1.7 + 6), true);
      g.fillStyle(0x2a2440, alpha).fillPoints(box(0, -TANK_R * 0.68, TANK_R * 2, TANK_R * 0.36), true);
      g.fillStyle(0x2a2440, alpha).fillPoints(box(0, TANK_R * 0.68, TANK_R * 2, TANK_R * 0.36), true);
      g.fillStyle(hex(tank.color), alpha).fillPoints(box(0, 0, TANK_R * 1.7, TANK_R * 1.0), true);
      g.fillStyle(0x140f2e, alpha).fillPoints(box(TANK_R * 0.75, 0, TANK_R * 1.1, 12), true);
      g.fillStyle(0xdddddd, alpha).fillPoints(box(TANK_R * 0.75, 0, TANK_R * 1.1 - 4, 7), true);
      g.fillStyle(0x140f2e, alpha).fillCircle(x, y, TANK_R * 0.45);
      g.fillStyle(hex(tank.color), alpha).fillCircle(x, y, TANK_R * 0.36);
      g.fillStyle(0xffffff, 0.35 * alpha).fillCircle(x - 4, y - 4, TANK_R * 0.14);
    }
    for (const sh of curr.shells) {
      const was = prev.shells.find((o) => o.id === sh.id);
      // A bounce in between: don't draw it cutting the corner through the wall.
      const near = was && Math.hypot(was.x - sh.x, was.y - sh.y) < 60;
      const x = near ? lerp(was.x, sh.x, t) : sh.x;
      const y = near ? lerp(was.y, sh.y, t) : sh.y;
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, SHELL_R + 3);
      g.fillStyle(hex(sh.color), 1).fillCircle(x, y, SHELL_R);
      g.fillStyle(0xffffff, 0.8).fillCircle(x - 2, y - 2, SHELL_R * 0.4);
    }
    const now = performance.now();
    this.bursts = this.bursts.filter((b) => now - b.at < BURST_MS);
    for (const b of this.bursts) {
      const p = (now - b.at) / BURST_MS;
      g.fillStyle(0xffd166, 1 - p).fillCircle(b.x, b.y, 10 + 30 * p);
      g.fillStyle(0xff5d2a, (1 - p) * 0.8).fillCircle(b.x, b.y, 6 + 18 * p);
    }
  }
}
