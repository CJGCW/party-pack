import Phaser from 'phaser';
import { FLOOR_A, FLOOR_B, FLOOR_DARK, GOLD, INK, block, softShadow } from '../art';
import type { VolleyBoardView } from '../../../shared/volleys';
import { BOARD_H, BOARD_W, WALK_MS, walked, type WindBoardState } from '../../../shared/games/windUp';
import { VolleyScene, type VolleySlot } from '../volleyScene';
import { hex } from '../theme';

type Slot = VolleySlot<WindBoardState>;

/** The lane: the toy starts here and the far end is the longest walk (with room to spare). */
const START_X = 90;
const END_X = BOARD_W - 60;
const GROUND = BOARD_H - 26;

/** The TV during Wind-Up Race: a lane per toy, wound up while everyone winds, then all walking at once. */
export class WindUpScene extends VolleyScene<WindBoardState> {
  static readonly KEY = 'wind-up';
  protected readonly title = 'WIND-UP RACE';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected shotWord = 'Walk';

  constructor() {
    super(WindUpScene.KEY);
  }

  protected statusText(board: VolleyBoardView<WindBoardState>) {
    return this.view?.phase === 'aim' ? `${board.state.energy} wound` : `${board.boardScore} m`;
  }

  protected resultTitle(board: VolleyBoardView<WindBoardState>) {
    return `${board.boardScore} m`;
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(FLOOR_DARK, FLOOR_DARK, FLOOR_A, FLOOR_A, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle(FLOOR_B, 1).fillRect(0, GROUND, BOARD_W, BOARD_H - GROUND);
    g.fillStyle(INK, 1).fillRect(0, GROUND, BOARD_W, 4);
    for (let x = START_X; x < BOARD_W; x += 100) g.fillStyle(0x8b7cf6, 0.25).fillRect(x, GROUND, 3, 10);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, seconds: number, time: number) {
    const v = this.view!;
    const s = slot.board.state;
    // The longest walk this time sets the scale (so they all fit).
    const longest = Math.max(1, ...v.boards.map((b) => b.state.distance));
    const t = v.phase === 'fly' ? (seconds * 1000) / WALK_MS : v.phase === 'aim' ? 0 : 1;
    const metres = walked(s.distance, t);
    const x = START_X + (metres / longest) * (END_X - START_X) * 0.95;
    const moving = v.phase === 'fly' && t < 1 && s.distance > 0;
    const step = moving ? Math.sin(time / 70) : 0;
    const color = hex(slot.board.color);
    // Legs, body, eye and the key on its back (spinning while it walks, or as it's wound).
    softShadow(g, x, GROUND + 4, 90, 14);
    g.lineStyle(8, INK, 1).lineBetween(x - 14, GROUND - 26, x - 14 + step * 10, GROUND).lineBetween(x + 14, GROUND - 26, x + 14 - step * 10, GROUND);
    block(g, x - 36, GROUND - 92 + Math.abs(step) * 3, 72, 70, color);
    g.fillStyle(0xffffff, 1).fillCircle(x + 14, GROUND - 66, 9);
    g.fillStyle(INK, 1).fillCircle(x + 17, GROUND - 66, 4);
    const spin = v.phase === 'aim' ? s.energy / 20 : moving ? time / 60 : 0;
    const kx = x - 48;
    const ky = GROUND - 60;
    g.lineStyle(6, INK, 1).lineBetween(x - 32, ky, kx, ky);
    g.fillStyle(GOLD, 1).fillEllipse(kx - 4, ky + Math.sin(spin) * 14, 14, 18 * Math.abs(Math.cos(spin)) + 6);
    if (v.phase !== 'aim' && s.distance > 0) g.fillStyle(0xffffff, 0.15).fillRect(START_X, GROUND - 4, x - START_X, 4);
  }
}
