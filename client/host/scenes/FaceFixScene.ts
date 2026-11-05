import Phaser from 'phaser';
import { FLOOR_A, FLOOR_DARK, INK, shade } from '../art';
import type { VolleyBoardView } from '../../../shared/volleys';
import { faceGeometry, facesFor, type Face, type FixBoardState } from '../../../shared/games/faceFix';
import { VolleyScene, type VolleySlot } from '../volleyScene';
import { COLORS, text } from '../theme';

type Slot = VolleySlot<FixBoardState>;

const BOARD_W = 420;
const BOARD_H = 440;
const FACE = 200;

/** Draws a face (a ghost, faintly, or the real thing). */
export function drawFace(g: Phaser.GameObjects.Graphics, f: Face, cx: number, cy: number, size: number, alpha = 1, skin = 0xf2c9a0) {
  const geo = faceGeometry(f, cx, cy, size);
  g.fillStyle(INK, alpha).fillEllipse(cx, cy, geo.rx * 2 + 8, geo.ry * 2 + 8);
  g.fillStyle(shade(skin, -0.16), alpha).fillEllipse(cx, cy, geo.rx * 2, geo.ry * 2);
  g.fillStyle(skin, alpha).fillEllipse(cx - geo.rx * 0.03, cy - geo.ry * 0.05, geo.rx * 1.84, geo.ry * 1.82);
  for (const e of geo.eyes) {
    g.fillStyle(0xffffff, alpha).fillCircle(e.x, e.y, geo.eyeR * 1.6);
    g.fillStyle(INK, alpha).fillCircle(e.x, e.y, geo.eyeR);
  }
  g.fillStyle(0xd9a066, alpha).fillTriangle(geo.nose.x, geo.nose.y - size * 0.08, geo.nose.x - size * 0.05, geo.nose.y + size * 0.03, geo.nose.x + size * 0.05, geo.nose.y + size * 0.03);
  g.fillStyle(0xc0392b, alpha).fillEllipse(geo.mouth.x, geo.mouth.y, geo.mouth.w, size * 0.07);
}

/** The TV during Face Fix: the face to copy on every board while they work, then each player's attempt over it. */
export class FaceFixScene extends VolleyScene<FixBoardState> {
  static readonly KEY = 'face-fix';
  protected readonly title = 'FACE FIX';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected shotWord = 'Face';
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super(FaceFixScene.KEY);
  }

  protected statusText(board: VolleyBoardView<FixBoardState>) {
    return String(board.boardScore);
  }

  protected resultTitle(board: VolleyBoardView<FixBoardState>) {
    return `${board.boardScore} POINTS`;
  }

  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(FLOOR_A, FLOOR_A, FLOOR_DARK, FLOOR_DARK, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const label = text(this, BOARD_W / 2, BOARD_H - 36, '', 32, COLORS.text, { fontStyle: '700' });
    slot.container.add(label);
    this.labels.set(slot.playerId, label);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const v = this.view!;
    const round = (v as unknown as { round: { face: number } }).round;
    const { target } = facesFor(v.seed, round.face);
    const s = slot.board.state;
    const label = this.labels.get(slot.playerId);
    if (s.face) {
      // The attempt, with the target faintly behind it.
      drawFace(g, target, BOARD_W / 2, BOARD_H / 2 - 20, FACE, 0.25, 0xffffff);
      drawFace(g, s.face, BOARD_W / 2, BOARD_H / 2 - 20, FACE, 0.9);
      label?.setText(`${s.match}% match`).setColor(s.match !== null && s.match >= 85 ? COLORS.accent : COLORS.text);
    } else {
      drawFace(g, target, BOARD_W / 2, BOARD_H / 2 - 20, FACE);
      label?.setText(slot.board.locked ? 'DONE' : s.done ? 'fixing…' : '').setColor(COLORS.muted);
    }
  }
}
