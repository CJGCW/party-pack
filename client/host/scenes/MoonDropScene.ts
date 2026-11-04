import Phaser from 'phaser';
import type { ArenaEntry, ArenaHostView } from '../../../shared/arena';
import { LANDER_R, WORLD_H, WORLD_W, moonFor, type MoonWorld } from '../../../shared/games/moonDrop';
import { ArenaScene } from '../arenaScene';
import { hex, text } from '../theme';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Moon Drop: the moon (from the seed), its pads and their worth, and everyone's lander coming down. */
export class MoonDropScene extends ArenaScene<MoonWorld> {
  static readonly KEY = 'moon-drop';
  protected readonly title = 'MOON DROP';
  protected readonly scoring = 'best';
  protected readonly worldW = WORLD_W;
  protected readonly worldH = WORLD_H;
  private padLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(MoonDropScene.KEY);
  }

  protected statusText(p: ArenaEntry) {
    const l = this.curr?.world.landers.find((o) => o.playerId === p.playerId);
    if (!l) return '';
    return l.status === 'flying' ? `fuel ${l.fuel}%` : l.status === 'crashed' ? 'crashed' : String(l.score);
  }

  protected drawStatic(g: Phaser.GameObjects.Graphics, view: ArenaHostView<MoonWorld>) {
    g.fillStyle(0x07051a, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    let s = view.seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) g.fillStyle(0xffffff, 0.2 + rand() * 0.6).fillCircle(rand() * WORLD_W, rand() * WORLD_H * 0.7, rand() * 2 + 0.5);
    const { points, pads } = moonFor(view.seed);
    const outline = [new Phaser.Math.Vector2(0, WORLD_H), ...points.map(([x, y]) => new Phaser.Math.Vector2(x, y)), new Phaser.Math.Vector2(WORLD_W, WORLD_H)];
    g.fillStyle(0x6d6496, 1).fillPoints(outline, true);
    g.lineStyle(4, 0x9a93b8, 1).strokePoints(outline.slice(1, -1), false);
    for (const label of this.padLabels) label.destroy();
    this.padLabels = pads.map((p) => {
      g.fillStyle(0xffd166, 1).fillRect(p.x0, p.y - 4, p.x1 - p.x0, 8);
      const t = text(this, (p.x0 + p.x1) / 2, p.y + 34, `x${p.mult}`, 34, '#ffd166', { fontStyle: '700' });
      this.worldLayer.add(t);
      return t;
    });
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: MoonWorld, curr: MoonWorld, t: number, time: number) {
    for (const l of curr.landers) {
      const was = prev.landers.find((o) => o.playerId === l.playerId);
      const x = was ? lerp(was.x, l.x, t) : l.x;
      const y = was ? lerp(was.y, l.y, t) : l.y;
      const a = was ? lerp(was.angle, l.angle, t) : l.angle;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const at = (px: number, py: number) => new Phaser.Math.Vector2(x + px * c - py * s, y + px * s + py * c);
      if (l.status === 'crashed') {
        g.fillStyle(0xff5d2a, 0.5 + 0.3 * Math.sin(time / 90)).fillCircle(x, y, LANDER_R * 1.3);
        g.fillStyle(0x444444, 1).fillCircle(x - 8, y + 6, 8).fillCircle(x + 10, y + 2, 6);
        continue;
      }
      if (l.thrusting) g.fillStyle(0xffd166, 0.9).fillTriangle(at(-8, LANDER_R).x, at(-8, LANDER_R).y, at(8, LANDER_R).x, at(8, LANDER_R).y, at(0, LANDER_R + 22 + 8 * Math.sin(time / 40)).x, at(0, LANDER_R + 22 + 8 * Math.sin(time / 40)).y);
      // Legs, then the body and its window.
      g.lineStyle(4, 0x140f2e, 1).lineBetween(at(-10, 6).x, at(-10, 6).y, at(-20, LANDER_R).x, at(-20, LANDER_R).y).lineBetween(at(10, 6).x, at(10, 6).y, at(20, LANDER_R).x, at(20, LANDER_R).y);
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, LANDER_R + 3);
      g.fillStyle(hex(l.color), 1).fillCircle(x, y, LANDER_R);
      g.fillStyle(0xbfe9ff, 1).fillCircle(at(0, -4).x, at(0, -4).y, 7);
      if (l.status === 'landed') g.lineStyle(3, 0xffd166, 0.6 + 0.4 * Math.sin(time / 150)).strokeCircle(x, y, LANDER_R + 10);
    }
  }
}
