import Phaser from 'phaser';
import type { ArenaEntry, ArenaHostView } from '../../../shared/arena';
import { LANDER_R, WORLD_H, WORLD_W, moonFor, type MoonWorld } from '../../../shared/games/moonDrop';
import { FIRE, FLOOR_DARK, GOLD, INK, STONE, ball, block, glow, shade } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst, impact, popText, shockwave } from '../fx';
import { COLORS, hex, text } from '../theme';

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

  /** A landing or a crash gets its moment. */
  protected onUpdate(prev: MoonWorld, next: MoonWorld) {
    for (const l of next.landers) {
      const was = prev.landers.find((o) => o.playerId === l.playerId);
      if (!was || was.status !== 'flying' || l.status === 'flying') continue;
      const at = this.screenOf(l.x, l.y);
      if (l.status === 'crashed') {
        burst(this, at.x, at.y, FIRE, 50);
        impact(this, 0.005);
      } else {
        shockwave(this, at.x, at.y, GOLD, 120);
        burst(this, at.x, at.y, GOLD, 30);
        popText(this, at.x, at.y - 50, `+${l.score}`, COLORS.accent, 48);
      }
    }
  }

  protected drawStatic(g: Phaser.GameObjects.Graphics, view: ArenaHostView<MoonWorld>) {
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    let s = view.seed;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) g.fillStyle(0xffffff, 0.2 + rand() * 0.6).fillCircle(rand() * WORLD_W, rand() * WORLD_H * 0.7, rand() * 2 + 0.5);
    const { points, pads } = moonFor(view.seed);
    const outline = [new Phaser.Math.Vector2(0, WORLD_H), ...points.map(([x, y]) => new Phaser.Math.Vector2(x, y)), new Phaser.Math.Vector2(WORLD_W, WORLD_H)];
    g.fillStyle(STONE, 1).fillPoints(outline, true);
    // Craters, only those fully under the surface.
    const surfaceAt = (x: number) => points.reduce((y, p, i) => (i && points[i - 1][0] <= x && x <= p[0] ? points[i - 1][1] + ((p[1] - points[i - 1][1]) * (x - points[i - 1][0])) / Math.max(1, p[0] - points[i - 1][0]) : y), WORLD_H);
    for (let i = 0; i < 26; i++) {
      const [cx, r] = [rand() * WORLD_W, 8 + rand() * 20];
      const cy = surfaceAt(cx) + r + 14 + rand() * 120;
      if (cy < WORLD_H) g.fillStyle(shade(STONE, -0.22), 1).fillEllipse(cx, cy, r * 2.4, r * 1.3);
    }
    g.lineStyle(10, INK, 1).strokePoints(outline.slice(1, -1), false);
    g.lineStyle(4, shade(STONE, 0.35), 1).strokePoints(outline.slice(1, -1), false);
    for (const label of this.padLabels) label.destroy();
    this.padLabels = pads.map((p) => {
      block(g, p.x0, p.y - 6, p.x1 - p.x0, 15, GOLD);
      const t = text(this, (p.x0 + p.x1) / 2, p.y + 34, `x${p.mult}`, 34, COLORS.accent, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 6 });
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
        glow(g, x, y, LANDER_R * 2.4, FIRE, 0.7 + 0.3 * Math.sin(time / 90));
        ball(g, x - 8, y + 6, 8, 0x4a4470);
        ball(g, x + 10, y + 2, 6, 0x4a4470);
        continue;
      }
      if (l.thrusting) glow(g, at(0, LANDER_R + 8).x, at(0, LANDER_R + 8).y, 46, FIRE);
      if (l.thrusting) g.fillStyle(GOLD, 0.95).fillTriangle(at(-8, LANDER_R).x, at(-8, LANDER_R).y, at(8, LANDER_R).x, at(8, LANDER_R).y, at(0, LANDER_R + 22 + 8 * Math.sin(time / 40)).x, at(0, LANDER_R + 22 + 8 * Math.sin(time / 40)).y);
      // Legs, then the body and its window.
      g.lineStyle(5, INK, 1).lineBetween(at(-10, 6).x, at(-10, 6).y, at(-20, LANDER_R).x, at(-20, LANDER_R).y).lineBetween(at(10, 6).x, at(10, 6).y, at(20, LANDER_R).x, at(20, LANDER_R).y);
      ball(g, x, y, LANDER_R, hex(l.color));
      ball(g, at(0, -3).x, at(0, -3).y, 6.5, 0xbfe9ff);
      if (l.status === 'landed') g.lineStyle(3, GOLD, 0.6 + 0.4 * Math.sin(time / 150)).strokeCircle(x, y, LANDER_R + 10);
    }
  }
}
