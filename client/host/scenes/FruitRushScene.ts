import Phaser from 'phaser';
import type { ArenaHostView } from '../../../shared/arena';
import { FRUIT_R, PLAYER_R, WORLD, type FruitWorld } from '../../../shared/games/fruitRush';
import { ArenaScene } from '../arenaScene';
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

  /** Grass with mown stripes and a fence. */
  protected drawStatic(g: Phaser.GameObjects.Graphics, _view: ArenaHostView<FruitWorld>) {
    for (let i = 0; i < 10; i++) g.fillStyle(i % 2 ? 0x4fb862 : 0x56c26a, 1).fillRect(0, i * 100, WORLD, 100);
    g.lineStyle(14, 0x8a6238, 1).strokeRect(7, 7, WORLD - 14, WORLD - 14);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: FruitWorld, curr: FruitWorld, t: number) {
    for (const f of curr.fruit) {
      const color = f.gold ? 0xffd166 : FRUIT_COLORS[f.id % FRUIT_COLORS.length];
      if (f.falling < 1) {
        // A shadow where it'll land, growing, and the fruit dropping onto it.
        g.fillStyle(0x000000, 0.15 + 0.2 * f.falling).fillEllipse(f.x, f.y + 6, FRUIT_R * 2 * f.falling + 6, FRUIT_R * f.falling + 3);
        const drop = (1 - f.falling) * 300;
        g.fillStyle(color, f.falling).fillCircle(f.x, f.y - drop, FRUIT_R);
        continue;
      }
      g.fillStyle(0x000000, 0.25).fillEllipse(f.x + 4, f.y + 10, FRUIT_R * 2, FRUIT_R * 0.8);
      g.fillStyle(0x140f2e, 1).fillCircle(f.x, f.y, FRUIT_R + 3);
      g.fillStyle(color, 1).fillCircle(f.x, f.y, FRUIT_R);
      g.fillStyle(0x3aa86a, 1).fillEllipse(f.x + 6, f.y - FRUIT_R, 14, 8);
      if (f.gold) g.fillStyle(0xffffff, 0.8).fillCircle(f.x - 7, f.y - 7, 6);
    }
    for (const p of curr.players) {
      const was = prev.players.find((o) => o.playerId === p.playerId);
      const x = was ? lerp(was.x, p.x, t) : p.x;
      const y = was ? lerp(was.y, p.y, t) : p.y;
      g.fillStyle(0x000000, 0.3).fillCircle(x + 5, y + 9, PLAYER_R);
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, PLAYER_R + 5);
      g.fillStyle(hex(p.color), 1).fillCircle(x, y, PLAYER_R);
      g.fillStyle(0xffffff, 0.45).fillCircle(x - PLAYER_R * 0.35, y - PLAYER_R * 0.35, PLAYER_R * 0.3);
    }
  }
}
