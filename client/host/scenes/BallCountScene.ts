import Phaser from 'phaser';
import type { VolleyBoardView } from '../../../shared/volleys';
import { guessPoints, type CountBoardState } from '../../../shared/games/ballCount';
import { VolleyScene, type VolleySlot } from '../volleyScene';
import { COLORS, hex, text } from '../theme';

type Slot = VolleySlot<CountBoardState>;

const BOARD_W = 420;
const BOARD_H = 300;

/** The TV during Ball Count: everyone's box, rattling while they feel, then opened with their guess and the answer. */
export class BallCountScene extends VolleyScene<CountBoardState> {
  static readonly KEY = 'ball-count';
  protected readonly title = 'BALL COUNT';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  protected shotWord = 'Box';
  private labels = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super(BallCountScene.KEY);
  }

  protected statusText(board: VolleyBoardView<CountBoardState>) {
    return `${board.boardScore}`;
  }

  protected resultTitle(board: VolleyBoardView<CountBoardState>) {
    return `${board.boardScore} POINTS`;
  }

  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x1d1640, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const label = text(this, BOARD_W / 2, BOARD_H - 40, '', 34, COLORS.text, { fontStyle: '700' });
    slot.container.add(label);
    this.labels.set(slot.playerId, label);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, _seconds: number, time: number) {
    const s = slot.board.state;
    const v = this.view!;
    const cx = BOARD_W / 2;
    const cy = 130;
    const open = s.actual !== null;
    const shake = !open && v.phase === 'aim' ? Math.sin(time / 37 + cx) * 4 : 0;
    // The box: lid off at the reveal, with the balls inside.
    g.fillStyle(0x140f2e, 1).fillRoundedRect(cx - 104 + shake, cy - 64, 208, 128, 14);
    g.fillStyle(0xb07a45, 1).fillRoundedRect(cx - 100 + shake, cy - 60, 200, 120, 12);
    if (open) {
      g.fillStyle(0x3a2a1f, 1).fillRoundedRect(cx - 88, cy - 48, 176, 96, 8);
      for (let i = 0; i < (s.actual ?? 0); i++) {
        const x = cx - 74 + (i % 7) * 25;
        const y = cy - 30 + Math.floor(i / 7) * 26;
        g.fillStyle(0xffd166, 1).fillCircle(x, y, 10);
      }
    } else {
      g.fillStyle(0x8f5f34, 1).fillRect(cx - 100 + shake, cy - 10, 200, 8);
      if (s.guessed) g.fillStyle(hex(slot.board.color), 1).fillCircle(cx + shake, cy, 20);
    }
    const label = this.labels.get(slot.playerId);
    label?.setText(open ? (s.guess === null ? `${s.actual}: no guess` : `${s.guess} → ${s.actual}  +${guessPoints(s.guess, s.actual!)}`) : s.guessed ? 'GUESSED' : 'feeling…');
    label?.setColor(open && s.guess === s.actual ? COLORS.accent : COLORS.text);
  }
}
