import Phaser from 'phaser';
import type { ArenaHostView } from '../../../shared/arena';
import { GRID_H, GRID_W, STEP, type TrailsWorld } from '../../../shared/games/lightTrails';
import { ArenaScene } from '../arenaScene';
import { hex } from '../theme';

/** A grid cell is this many world units. */
const CELL = 16;

/** The TV during Light Trails: the arena, everyone's trails glowing, and the walls closing in late on. */
export class LightTrailsScene extends ArenaScene<TrailsWorld> {
  static readonly KEY = 'light-trails';
  protected readonly title = 'LIGHT TRAILS';
  protected readonly scoring = 'survival';
  protected readonly worldW = GRID_W * CELL;
  protected readonly worldH = GRID_H * CELL;

  constructor() {
    super(LightTrailsScene.KEY);
  }

  /** A dark floor with a faint grid. */
  protected drawStatic(g: Phaser.GameObjects.Graphics, _view: ArenaHostView<TrailsWorld>) {
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, this.worldW, this.worldH);
    g.lineStyle(1, 0x5ec8f2, 0.08);
    for (let x = 0; x <= GRID_W; x += 4) g.lineBetween(x * CELL, 0, x * CELL, this.worldH);
    for (let y = 0; y <= GRID_H; y += 4) g.lineBetween(0, y * CELL, this.worldW, y * CELL);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: TrailsWorld, curr: TrailsWorld, t: number, time: number) {
    // The walls, where they've closed in to.
    if (curr.inset > 0) {
      const w = curr.inset * CELL;
      g.fillStyle(0xff5d73, 0.35 + 0.15 * Math.sin(time / 150));
      g.fillRect(0, 0, this.worldW, w).fillRect(0, this.worldH - w, this.worldW, w).fillRect(0, 0, w, this.worldH).fillRect(this.worldW - w, 0, w, this.worldH);
    }
    g.lineStyle(6, 0x5ec8f2, 0.6).strokeRect(curr.inset * CELL, curr.inset * CELL, this.worldW - 2 * curr.inset * CELL, this.worldH - 2 * curr.inset * CELL);

    for (const r of curr.riders) {
      const color = hex(r.color);
      const was = prev.riders.find((o) => o.playerId === r.playerId);
      // The head moves smoothly from where it was toward where it is.
      const n = r.trail.length;
      let hx = r.trail[n - 2];
      let hy = r.trail[n - 1];
      if (r.alive && was && was.trail.length >= 2) {
        const px = was.trail[was.trail.length - 2];
        const py = was.trail[was.trail.length - 1];
        if (Math.abs(px - hx) + Math.abs(py - hy) <= 3) {
          hx = px + (hx - px) * t;
          hy = py + (hy - py) * t;
        }
      }
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < n - 2; i += 2) pts.push(new Phaser.Math.Vector2((r.trail[i] + 0.5) * CELL, (r.trail[i + 1] + 0.5) * CELL));
      pts.push(new Phaser.Math.Vector2((hx + 0.5) * CELL, (hy + 0.5) * CELL));
      const alpha = r.alive ? 1 : 0.35;
      g.lineStyle(CELL * 1.6, color, 0.22 * alpha).strokePoints(pts, false);
      g.lineStyle(CELL * 0.8, color, alpha).strokePoints(pts, false);
      g.lineStyle(CELL * 0.25, 0xffffff, 0.6 * alpha).strokePoints(pts, false);
      if (!r.alive) continue;
      // The cycle: a bright head, pointing the way it's going.
      const [dx, dy] = STEP[r.dir];
      const cx = (hx + 0.5) * CELL;
      const cy = (hy + 0.5) * CELL;
      g.fillStyle(0xffffff, 1).fillCircle(cx, cy, CELL * 0.8);
      g.fillStyle(color, 1).fillTriangle(cx + dx * CELL * 1.6, cy + dy * CELL * 1.6, cx - dy * CELL * 0.9, cy + dx * CELL * 0.9, cx + dy * CELL * 0.9, cy - dx * CELL * 0.9);
    }
  }
}
