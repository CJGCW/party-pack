import Phaser from 'phaser';
import type { ArenaHostView } from '../../../shared/arena';
import { PLAYER_R, TILE_COLORS, WORLD, layoutById, type HeatWorld } from '../../../shared/games/hexHeat';
import { ArenaScene } from '../arenaScene';
import { hex } from '../theme';

const FILLS = TILE_COLORS.map(hex);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Hexagon Heat: the floor, the colour called (with a bar running down), and the rest of the floor dropping away. */
export class HexHeatScene extends ArenaScene<HeatWorld> {
  static readonly KEY = 'hex-heat';
  protected readonly title = 'HEXAGON HEAT';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD;
  protected readonly worldH = WORLD + 90;

  constructor() {
    super(HexHeatScene.KEY);
  }

  protected drawStatic(g: Phaser.GameObjects.Graphics, _view: ArenaHostView<HeatWorld>) {
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, this.worldW, this.worldH);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: HeatWorld, curr: HeatWorld, t: number, time: number) {
    const layout = layoutById(curr.layoutId);
    const top = 90;
    // The colour called, and how long's left to get on it.
    const called = FILLS[curr.called];
    const left = curr.stage === 'call' ? Math.max(0, curr.stageMs - (performance.now() - (this.curr?.at ?? 0))) / curr.stageLength : 0;
    g.fillStyle(0x241d55, 1).fillRoundedRect(20, 16, WORLD - 40, 58, 29);
    if (curr.stage !== 'back') g.fillStyle(called, 1).fillRoundedRect(20, 16, Math.max(58, (WORLD - 40) * (curr.stage === 'call' ? left : 1)), 58, 29);

    layout.tiles.forEach((tile, i) => {
      const dropped = curr.stage === 'drop' && curr.colors[i] !== curr.called;
      const pts = tile.points.map(([x, y]) => new Phaser.Math.Vector2(x, y + top));
      if (dropped) {
        g.fillStyle(0x000000, 1).fillPoints(pts, true);
        return;
      }
      // Tiles of the colour called glow while there's time to get there.
      const glow = curr.stage === 'call' && curr.colors[i] === curr.called ? 0.25 + 0.2 * Math.sin(time / 90) : 0;
      g.fillStyle(FILLS[curr.colors[i]], 1).fillPoints(pts, true);
      if (glow) g.fillStyle(0xffffff, glow).fillPoints(pts, true);
      g.lineStyle(4, 0x140f2e, 0.6).strokePoints(pts, true);
    });

    for (const p of curr.players) {
      if (!p.in) continue;
      const was = prev.players.find((o) => o.playerId === p.playerId);
      const x = was ? lerp(was.x, p.x, t) : p.x;
      const y = (was ? lerp(was.y, p.y, t) : p.y) + top;
      g.fillStyle(0x000000, 0.35).fillCircle(x + 5, y + 8, PLAYER_R);
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, PLAYER_R + 5);
      g.fillStyle(hex(p.color), 1).fillCircle(x, y, PLAYER_R);
      g.fillStyle(0xffffff, 0.5).fillCircle(x - PLAYER_R * 0.35, y - PLAYER_R * 0.35, PLAYER_R * 0.3);
    }
  }
}
