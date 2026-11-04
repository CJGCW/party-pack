import Phaser from 'phaser';
import type { VolleyBoardView } from '../../../shared/volleys';
import { trackAt } from '../../../shared/volleys';
import {
  BOARD_H,
  BOARD_W,
  HILL,
  LAUNCH,
  PX,
  STONE_R,
  flightAt,
  toBoard,
  type CastleBoardState,
  type Piece,
} from '../../../shared/games/castleCrush';
import { VolleyScene, type VolleySlot } from '../volleyScene';
import { hex } from '../theme';

type Slot = VolleySlot<CastleBoardState>;

/** While aiming, the guide shows the first this-many seconds of the flight. */
const GUIDE_S = 0.45;
const GROUND_Y = BOARD_H;
const WOOD = { block: 0xb07a45, slab: 0x8f5f34 };

/** A box's corners, turned `a` (radians, clockwise) round its middle. */
function corners(x: number, y: number, hw: number, hh: number, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([px, py]) => new Phaser.Math.Vector2(x + px * c - py * s, y + px * s + py * c));
}

/** The TV during Castle Crush: everyone's castle side by side (see ../volleyScene), their catapult aiming, then the shots crashing in. */
export class CastleCrushScene extends VolleyScene<CastleBoardState> {
  static readonly KEY = 'castle-crush';
  protected readonly title = 'CASTLE CRUSH';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;

  constructor() {
    super(CastleCrushScene.KEY);
  }

  protected statusText(board: VolleyBoardView<CastleBoardState>) {
    const s = board.state;
    return `${board.boardScore} · ${s.guardsDown}/${s.guards} guards`;
  }

  protected resultTitle(board: VolleyBoardView<CastleBoardState>) {
    return `${board.boardScore} DAMAGE`;
  }

  /** Sky, hills far off, the ground and the hill in front of the castle. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(0x5ec8f2, 0x5ec8f2, 0xbfe9ff, 0xbfe9ff, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle(0x9ad7a8, 1).fillEllipse(BOARD_W * 0.3, GROUND_Y, BOARD_W * 0.7, 220).fillEllipse(BOARD_W * 0.85, GROUND_Y, BOARD_W * 0.6, 170);
    g.fillStyle(0x4cae5c, 1).fillPoints(
      HILL.map(([x, y]) => {
        const p = toBoard(x, y);
        return new Phaser.Math.Vector2(p.x, p.y);
      }),
      true,
    );
    g.fillStyle(0x3f9a4e, 1).fillRect(0, GROUND_Y - 6, BOARD_W, 6);
    // The catapult's frame.
    const base = toBoard(LAUNCH.x, 0);
    g.fillStyle(0x6b4423, 1).fillRect(base.x - 40, base.y - 22, 80, 16).fillTriangle(base.x - 22, base.y - 22, base.x + 22, base.y - 22, base.x, base.y - 60);
    g.fillStyle(0x140f2e, 1).fillCircle(base.x - 26, base.y - 6, 9).fillCircle(base.x + 26, base.y - 6, 9);
  }

  private drawPiece(g: Phaser.GameObjects.Graphics, p: Piece, x: number, y: number, a: number) {
    if (p.kind === 'guard') {
      // A little guard with a crown.
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, p.hw + 3);
      g.fillStyle(0x4cd37a, 1).fillCircle(x, y, p.hw);
      g.fillStyle(0xffffff, 1).fillCircle(x - 4, y - 2, 3.5).fillCircle(x + 4, y - 2, 3.5);
      g.fillStyle(0xffd166, 1).fillTriangle(x - 9, y - p.hw + 2, x + 9, y - p.hw + 2, x, y - p.hw - 10);
      return;
    }
    const pts = corners(x, y, p.hw, p.hh, a);
    g.fillStyle(0x140f2e, 1).fillPoints(corners(x, y, p.hw + 2, p.hh + 2, a), true);
    g.fillStyle(p.kind === 'slab' ? WOOD.slab : WOOD.block, p.down ? 0.8 : 1).fillPoints(pts, true);
    if (p.down) g.fillStyle(0x000000, 0.2).fillPoints(pts, true);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, seconds: number, time: number) {
    const s = slot.board.state;
    const view = this.view!;
    const rec = view.phase === 'fly' ? s.shot : null;
    const frame = rec ? Math.min(rec.frames - 1, seconds * rec.fps) : 0;
    const tracks = new Map((rec?.tracks ?? []).map((t) => [t.id, t]));
    for (const p of s.pieces) {
      const track = tracks.get(p.id);
      const at = track ? trackAt(track, frame) : 'before';
      if (at === 'gone') continue;
      if (at === 'before') this.drawPiece(g, p, p.x, p.y, p.a);
      else this.drawPiece(g, p, at.x, at.y, at.a);
    }
    // The stone (a thing the board didn't have before the shot).
    const ids = new Set(s.pieces.map((p) => p.id));
    for (const track of rec?.tracks ?? []) {
      if (ids.has(track.id)) continue;
      const at = trackAt(track, frame);
      if (typeof at !== 'object') continue;
      g.fillStyle(0x140f2e, 1).fillCircle(at.x, at.y, STONE_R * PX + 3);
      g.fillStyle(0x8a8aa3, 1).fillCircle(at.x, at.y, STONE_R * PX);
    }
    // The catapult's arm, pointing where it's aimed (and the first stretch of the flight while aiming).
    const pivot = toBoard(LAUNCH.x, 0);
    const pv = { x: pivot.x, y: pivot.y - 60 };
    const end = toBoard(LAUNCH.x, LAUNCH.y);
    const arm = view.phase === 'aim' ? s.aim.elevation : 0.15;
    g.lineStyle(10, 0x140f2e, 1).lineBetween(pv.x - Math.cos(arm) * 30, pv.y + Math.sin(arm) * 30, pv.x + Math.cos(arm) * 40, pv.y - Math.sin(arm) * 40);
    g.lineStyle(6, 0x8f5f34, 1).lineBetween(pv.x - Math.cos(arm) * 30, pv.y + Math.sin(arm) * 30, pv.x + Math.cos(arm) * 40, pv.y - Math.sin(arm) * 40);
    if (view.phase === 'aim' && s.shotsLeft > 0) {
      g.fillStyle(0x8a8aa3, 1).fillCircle(end.x, end.y, STONE_R * PX);
      g.fillStyle(hex(slot.board.color), 0.9);
      for (let t = 0.04; t < GUIDE_S; t += 0.04) {
        const f = flightAt(s.aim.elevation, s.aim.power, t);
        const p = toBoard(f.x, f.y);
        g.fillCircle(p.x, p.y, 4 + 1.5 * Math.sin(time / 120 + t * 20));
      }
    }
    // Shots left, as stones by the catapult.
    for (let k = 0; k < s.shotsLeft; k++) g.fillStyle(0x6d6d85, 1).fillCircle(20 + k * 24, GROUND_Y - 14, 9);
  }
}
