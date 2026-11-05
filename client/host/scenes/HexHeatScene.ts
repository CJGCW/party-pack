import Phaser from 'phaser';
import type { ArenaHostView } from '../../../shared/arena';
import { LAYOUT, PLAYER_R, TILE_COLORS, WORLD, type HeatWorld } from '../../../shared/games/hexHeat';
import { ArenaScene } from '../arenaScene';
import { hex } from '../theme';

const FILLS = TILE_COLORS.map(hex);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Hot Hexes: the floor, the light showing the colour called, and the rest of the floor dropping away. */
export class HexHeatScene extends ArenaScene<HeatWorld> {
  static readonly KEY = 'hex-heat';
  protected readonly title = 'HOT HEXES';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD;
  protected readonly worldH = WORLD + 130;

  constructor() {
    super(HexHeatScene.KEY);
  }

  protected drawStatic(g: Phaser.GameObjects.Graphics, _view: ArenaHostView<HeatWorld>) {
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, this.worldW, this.worldH);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: HeatWorld, curr: HeatWorld, t: number, time: number) {
    const top = 130;
    // The light above the floor shows the colour called, and it's dark between calls. The bars on
    // either side run in towards it as time runs out.
    const lit = curr.stage !== 'back';
    const called = FILLS[curr.called];
    const left = curr.stage === 'call' ? Math.max(0, curr.stageMs - (performance.now() - (this.curr?.at ?? 0))) / curr.stageLength : 0;
    const [lightX, lightY, lightR] = [WORLD / 2, 64, 54];
    const reach = (WORLD / 2 - lightR - 40) * left;
    g.fillStyle(0x241d55, 1).fillRoundedRect(20, 56, WORLD - 40, 16, 8);
    if (reach > 0) g.fillStyle(0xffffff, 0.75).fillRect(lightX - lightR - reach, 56, reach * 2 + lightR * 2, 16);
    if (lit) g.fillStyle(called, 0.25).fillCircle(lightX, lightY, lightR + 12 + 3 * Math.sin(time / 120));
    g.fillStyle(0x140f2e, 1).fillCircle(lightX, lightY, lightR + 5);
    g.fillStyle(lit ? called : 0x241d55, 1).fillCircle(lightX, lightY, lightR);
    if (lit) g.fillStyle(0xffffff, 0.45).fillCircle(lightX - lightR * 0.3, lightY - lightR * 0.3, lightR * 0.28);

    LAYOUT.tiles.forEach((tile, i) => {
      const dropped = curr.stage === 'drop' && curr.colors[i] !== curr.called;
      const pts = tile.points.map(([x, y]) => new Phaser.Math.Vector2(x, y + top));
      if (dropped) {
        g.fillStyle(0x000000, 1).fillPoints(pts, true);
        return;
      }
      g.fillStyle(FILLS[curr.colors[i]], 1).fillPoints(pts, true);
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
