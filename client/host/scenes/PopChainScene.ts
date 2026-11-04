import Phaser from 'phaser';
import type { VolleyBoardView } from '../../../shared/volleys';
import { DOT_R, FIELD_H, FIELD_W, blastRadius, dotAt, dotsFor, type Dot, type PopBoardState, type PopRound } from '../../../shared/games/popChain';
import { serverNow } from '../../clock';
import { VolleyScene, type VolleySlot } from '../volleyScene';
import { hex } from '../theme';

type Slot = VolleySlot<PopBoardState>;

const DOT_COLORS = [0xff5d73, 0xffd166, 0x4cd37a, 0x5ec8f2, 0xb48cff];

/** The TV during Pop Chain: everyone's copy of the field (see ../volleyScene), drifting while they aim, then each chain going off. */
export class PopChainScene extends VolleyScene<PopBoardState> {
  static readonly KEY = 'pop-chain';
  protected readonly title = 'POP CHAIN';
  protected readonly boardW = FIELD_W;
  protected readonly boardH = FIELD_H;
  protected shotWord = 'Field';
  private dots: Dot[] = [];
  private dotsKey = '';

  constructor() {
    super(PopChainScene.KEY);
  }

  protected statusText(board: VolleyBoardView<PopBoardState>) {
    return `${board.boardScore} popped`;
  }

  protected resultTitle(board: VolleyBoardView<PopBoardState>) {
    return `${board.boardScore} POPPED`;
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, FIELD_W, FIELD_H);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, seconds: number) {
    const v = this.view!;
    const round = (v as unknown as { round: PopRound }).round;
    const key = `${v.seed}|${round.field}`;
    if (key !== this.dotsKey) {
      this.dotsKey = key;
      this.dots = dotsFor(v.seed, round.field);
    }
    const chain = slot.board.state.chain;
    // While aiming, the field drifts in real time; while the chains play, from each tap's moment.
    const tapAt = chain ? chain.blasts[2] : 0;
    const t = chain ? tapAt + seconds * 1000 : v.phase === 'aim' ? serverNow() - round.startedAt : 0;
    this.dots.forEach((d, i) => {
      const popped = chain ? chain.popped[i] : -1;
      if (popped >= 0 && t >= popped) return;
      const p = dotAt(d, t);
      g.fillStyle(DOT_COLORS[d.color], 1).fillCircle(p.x, p.y, DOT_R);
    });
    if (chain) {
      for (let i = 0; i < chain.blasts.length; i += 3) {
        const r = blastRadius(t - chain.blasts[i + 2]);
        if (r <= 0) continue;
        const color = i === 0 ? hex(slot.board.color) : 0xffffff;
        g.fillStyle(color, 0.35).fillCircle(chain.blasts[i], chain.blasts[i + 1], r);
        g.lineStyle(3, color, 0.8).strokeCircle(chain.blasts[i], chain.blasts[i + 1], r);
      }
    }
  }
}
