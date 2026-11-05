import Phaser from 'phaser';
import type { ArenaHostView } from '../../../shared/arena';
import { FRUIT_R, PLAYER_R, WORLD, type FruitWorld } from '../../../shared/games/fruitRush';
import { GOLD, INK, WOOD, ball, glow, shade, softShadow } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst } from '../fx';
import { hex } from '../theme';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const FRUIT_COLORS = [0xff5d73, 0xff9f43, 0x4cd37a, 0xb48cff];

/** The TV during Fruit Rush: the yard, fruit falling in (a shadow growing where it'll land), and everyone rolling about. */
export class FruitRushScene extends ArenaScene<FruitWorld> {
  static readonly KEY = 'fruit-rush';
  protected readonly title = 'FRUIT RUSH';
  protected readonly scoring = 'best';
  protected readonly worldW = WORLD;
  protected readonly worldH = WORLD;

  constructor() {
    super(FruitRushScene.KEY);
  }

  /** Fruit that's gone has been picked up: a little sparkle where it was. */
  protected onUpdate(prev: FruitWorld, next: FruitWorld) {
    const still = new Set(next.fruit.map((f) => f.id));
    for (const f of prev.fruit) {
      if (still.has(f.id) || f.falling < 1) continue;
      const at = this.screenOf(f.x, f.y);
      burst(this, at.x, at.y, f.gold ? GOLD : FRUIT_COLORS[f.id % FRUIT_COLORS.length], f.gold ? 28 : 12);
    }
  }

  /** Grass with mown stripes and a fence. */
  protected drawStatic(g: Phaser.GameObjects.Graphics, _view: ArenaHostView<FruitWorld>) {
    for (let i = 0; i < 10; i++) g.fillStyle(i % 2 ? 0x2f7d4f : 0x2c7549, 1).fillRect(0, i * 100, WORLD, 100);
    g.lineStyle(22, INK, 1).strokeRect(11, 11, WORLD - 22, WORLD - 22);
    g.lineStyle(14, WOOD, 1).strokeRect(11, 11, WORLD - 22, WORLD - 22);
    g.lineStyle(4, shade(WOOD, 0.3), 1).strokeRect(9, 9, WORLD - 18, WORLD - 18);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: FruitWorld, curr: FruitWorld, t: number) {
    for (const f of curr.fruit) {
      const color = f.gold ? 0xffd166 : FRUIT_COLORS[f.id % FRUIT_COLORS.length];
      if (f.falling < 1) {
        // A shadow where it'll land, growing, and the fruit dropping onto it.
        g.fillStyle(0x000000, 0.15 + 0.2 * f.falling).fillEllipse(f.x, f.y + 6, FRUIT_R * 2 * f.falling + 6, FRUIT_R * f.falling + 3);
        const drop = (1 - f.falling) * 300;
        ball(g, f.x, f.y - drop, FRUIT_R, color, f.falling);
        continue;
      }
      if (f.gold) glow(g, f.x, f.y, FRUIT_R * 3, GOLD);
      softShadow(g, f.x + 3, f.y + FRUIT_R * 0.9, FRUIT_R * 2, FRUIT_R * 0.8);
      ball(g, f.x, f.y, FRUIT_R, color);
      g.fillStyle(INK, 1).fillEllipse(f.x + 6, f.y - FRUIT_R * 1.02, 18, 11);
      g.fillStyle(0x4cd37a, 1).fillEllipse(f.x + 6, f.y - FRUIT_R * 1.02, 14, 7);
    }
    for (const p of curr.players) {
      const was = prev.players.find((o) => o.playerId === p.playerId);
      const x = was ? lerp(was.x, p.x, t) : p.x;
      const y = was ? lerp(was.y, p.y, t) : p.y;
      softShadow(g, x + 4, y + PLAYER_R * 0.85, PLAYER_R * 2, PLAYER_R * 0.9);
      ball(g, x, y, PLAYER_R, hex(p.color));
    }
  }
}
