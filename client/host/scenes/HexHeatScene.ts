import Phaser from 'phaser';
import type { ArenaHostView } from '../../../shared/arena';
import { LAYOUT, PLAYER_R, TILE_COLORS, WORLD, type HeatWorld } from '../../../shared/games/hexHeat';
import { FLOOR_A, FLOOR_DARK, INK, ball, shade, softShadow } from '../art';
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
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, this.worldW, this.worldH);
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
    g.fillStyle(FLOOR_A, 1).fillRoundedRect(20, 56, WORLD - 40, 16, 8);
    if (reach > 0) g.fillStyle(0xffffff, 0.75).fillRect(lightX - lightR - reach, 56, reach * 2 + lightR * 2, 16);
    if (lit) g.fillStyle(called, 0.25).fillCircle(lightX, lightY, lightR + 12 + 3 * Math.sin(time / 120));
    ball(g, lightX, lightY, lightR, lit ? called : FLOOR_A);

    LAYOUT.tiles.forEach((tile, i) => {
      const dropped = curr.stage === 'drop' && curr.colors[i] !== curr.called;
      const pts = tile.points.map(([x, y]) => new Phaser.Math.Vector2(x, y + top));
      if (dropped) {
        g.lineStyle(3, 0xffffff, 0.08).strokePoints(pts, true);
        return;
      }
      // A chunky tile: its side showing below, then the top, lit from above.
      const color = FILLS[curr.colors[i]];
      const side = pts.map((p) => new Phaser.Math.Vector2(p.x, p.y + 14));
      g.fillStyle(shade(color, -0.4), 1).fillPoints(side, true);
      g.lineStyle(6, INK, 1).strokePoints(side, true);
      g.fillStyle(color, 1).fillPoints(pts, true);
      g.lineStyle(6, INK, 1).strokePoints(pts, true);
      const mx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
      const my = pts.reduce((n, p) => n + p.y, 0) / pts.length;
      g.fillStyle(0xffffff, 0.14).fillPoints(pts.map((p) => new Phaser.Math.Vector2(mx + (p.x - mx) * 0.72, my + (p.y - my) * 0.72 - 8)), true);
    });

    for (const p of curr.players) {
      if (!p.in) continue;
      const was = prev.players.find((o) => o.playerId === p.playerId);
      const x = was ? lerp(was.x, p.x, t) : p.x;
      const y = (was ? lerp(was.y, p.y, t) : p.y) + top;
      softShadow(g, x + 3, y + PLAYER_R * 0.85, PLAYER_R * 2, PLAYER_R * 0.9);
      ball(g, x, y, PLAYER_R, hex(p.color));
    }
  }
}
