import Phaser from 'phaser';
import { GOLD, GOOD, GRASS, GRASS_DARK, INK, STONE as ROCK, ball, block, duskSky, shade } from '../art';
import { burst, impact, popText } from '../fx';
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
const WOOD = { block: 0xb9803f, slab: 0x8f5f34 };

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

  /** Guards toppled in a shot get their moment as it lands. */
  private guards = new Map<string, number>();

  /** Sky, hills far off, the ground and the hill in front of the castle. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    duskSky(g, 0, 0, BOARD_W, BOARD_H);
    g.fillStyle(shade(GRASS_DARK, -0.25), 1).fillEllipse(BOARD_W * 0.3, GROUND_Y, BOARD_W * 0.7, 220).fillEllipse(BOARD_W * 0.85, GROUND_Y, BOARD_W * 0.6, 170);
    g.fillStyle(GRASS, 1).fillPoints(
      HILL.map(([x, y]) => {
        const p = toBoard(x, y);
        return new Phaser.Math.Vector2(p.x, p.y);
      }),
      true,
    );
    g.fillStyle(GRASS_DARK, 1).fillRect(0, GROUND_Y - 6, BOARD_W, 6);
    // The catapult's frame.
    const base = toBoard(LAUNCH.x, 0);
    g.fillStyle(INK, 1).fillTriangle(base.x - 26, base.y - 20, base.x + 26, base.y - 20, base.x, base.y - 66);
    g.fillStyle(shade(WOOD.slab, -0.15), 1).fillTriangle(base.x - 22, base.y - 22, base.x + 22, base.y - 22, base.x, base.y - 60);
    block(g, base.x - 42, base.y - 24, 84, 20, WOOD.block);
    ball(g, base.x - 26, base.y - 6, 8, 0x3a3358);
    ball(g, base.x + 26, base.y - 6, 8, 0x3a3358);
  }

  private drawPiece(g: Phaser.GameObjects.Graphics, p: Piece, x: number, y: number, a: number) {
    if (p.kind === 'guard') {
      // A little guard with a crown.
      ball(g, x, y, p.hw, GOOD);
      g.fillStyle(0xffffff, 1).fillCircle(x - 4, y - 1, 3.5).fillCircle(x + 4, y - 1, 3.5);
      g.fillStyle(INK, 1).fillCircle(x - 3, y - 1, 1.6).fillCircle(x + 5, y - 1, 1.6);
      g.fillStyle(GOLD, 1).fillTriangle(x - 9, y - p.hw + 2, x + 9, y - p.hw + 2, x, y - p.hw - 10);
      return;
    }
    const pts = corners(x, y, p.hw, p.hh, a);
    const color = p.kind === 'slab' ? WOOD.slab : WOOD.block;
    g.fillStyle(INK, 1).fillPoints(corners(x, y, p.hw + 2, p.hh + 2, a), true);
    g.fillStyle(shade(color, -0.3), p.down ? 0.8 : 1).fillPoints(pts, true);
    g.fillStyle(color, p.down ? 0.8 : 1).fillPoints(corners(x, y, p.hw * 0.88, p.hh * 0.84, a), true);
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
      ball(g, at.x, at.y, STONE_R * PX, ROCK);
    }
    // The catapult's arm, pointing where it's aimed (and the first stretch of the flight while aiming).
    const pivot = toBoard(LAUNCH.x, 0);
    const pv = { x: pivot.x, y: pivot.y - 60 };
    const end = toBoard(LAUNCH.x, LAUNCH.y);
    const arm = view.phase === 'aim' ? s.aim.elevation : 0.15;
    g.lineStyle(10, INK, 1).lineBetween(pv.x - Math.cos(arm) * 30, pv.y + Math.sin(arm) * 30, pv.x + Math.cos(arm) * 40, pv.y - Math.sin(arm) * 40);
    g.lineStyle(6, 0x8f5f34, 1).lineBetween(pv.x - Math.cos(arm) * 30, pv.y + Math.sin(arm) * 30, pv.x + Math.cos(arm) * 40, pv.y - Math.sin(arm) * 40);
    if (view.phase === 'aim' && s.shotsLeft > 0) {
      ball(g, end.x, end.y, STONE_R * PX, ROCK);
      g.fillStyle(hex(slot.board.color), 0.9);
      for (let t = 0.04; t < GUIDE_S; t += 0.04) {
        const f = flightAt(s.aim.elevation, s.aim.power, t);
        const p = toBoard(f.x, f.y);
        g.fillCircle(p.x, p.y, 4 + 1.5 * Math.sin(time / 120 + t * 20));
      }
    }
    // Shots left, as stones by the catapult.
    for (let k = 0; k < s.shotsLeft; k++) ball(g, 20 + k * 24, GROUND_Y - 14, 8, ROCK);
    this.markGuards(slot, s);
  }

  private markGuards(slot: Slot, s: CastleBoardState) {
    const seen = this.guards.get(slot.playerId) ?? 0;
    if (s.guardsDown < seen) this.guards.set(slot.playerId, s.guardsDown);
    if (s.guardsDown <= seen || this.view!.phase === 'fly') return;
    this.guards.set(slot.playerId, s.guardsDown);
    const [x, y] = [slot.x + (BOARD_W * 0.7) * slot.scale, slot.y + (BOARD_H * 0.5) * slot.scale];
    burst(this, x, y, GOLD, 40);
    popText(this, x, y, s.guardsDown === s.guards ? 'ALL DOWN!' : 'GUARD DOWN!', '#ffd166', 52);
    impact(this, 0.004);
  }
}
