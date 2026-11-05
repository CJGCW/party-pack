import Phaser from 'phaser';
import { DANGER, FLOOR_DARK, FLOOR_A, GOLD, GOOD, INK, STONE, ball, block, glow } from '../art';
import { burst } from '../fx';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_W, type BeatRound, type BeatState, type Judgement } from '../../../shared/games/powerBeat';
import { serverNow } from '../../clock';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<BeatState, BeatState>;

/** A judgement shows for this long. */
const JUDGE_MS = 450;
const JUDGE_COLORS: Record<Judgement, number> = { perfect: GOLD, good: GOOD, off: 0x9a93b8, overload: DANGER };

/** The TV during Power Beat: everyone's generator side by side (see ../boardsScene), pulsing on the beat, filling with power. */
export class PowerBeatScene extends BoardsScene<BeatState, BeatRound> {
  static readonly KEY = 'power-beat';
  protected readonly title = 'POWER BEAT';
  protected readonly scoring = 'best';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private judgedAt = new Map<string, number>();

  constructor() {
    super(PowerBeatScene.KEY);
  }

  protected statusText(board: BoardView<BeatState>) {
    return `${board.boardScore} kW`;
  }

  protected resultTitle(board: BoardView<BeatState>) {
    return { title: `${board.boardScore} kW`, good: board.place === 1 };
  }

  protected onSnapshot(slot: Slot, prev: BeatState, next: BeatState) {
    if (next.judgedId === prev.judgedId) return;
    this.judgedAt.set(slot.playerId, performance.now());
    if (next.judged === 'perfect') {
      const at = this.screenOf(slot, BOARD_W / 2, 150);
      burst(this, at.x, at.y, GOLD, 14);
    }
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(FLOOR_A, FLOOR_A, FLOOR_DARK, FLOOR_DARK, 1).fillRect(0, 0, BOARD_W, BOARD_H);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const v = this.view!;
    const s = slot.curr!.snap;
    const round = v.round;
    // The beat: a pulse that flashes on each beat and fades.
    const sinceBeat = round && v.phase === 'play' ? (((serverNow() - round.epoch) % round.period) + round.period) % round.period : round?.period ?? 1;
    const pulse = Math.max(0, 1 - sinceBeat / 250);
    const cx = BOARD_W / 2;
    glow(g, cx, 150, 110 + 40 * pulse, hex(slot.board.color), 0.4 + 0.6 * pulse);
    ball(g, cx, 150, 50, hex(slot.board.color));
    // A bolt in the middle.
    g.fillStyle(GOLD, 1).fillTriangle(cx + 6, 112, cx - 20, 156, cx + 2, 156).fillTriangle(cx - 6, 188, cx + 20, 144, cx - 2, 144);
    // The last tap's judgement, as a ring.
    const at = this.judgedAt.get(slot.playerId);
    if (at !== undefined && s.judged) {
      const k = (performance.now() - at) / JUDGE_MS;
      if (k < 1) g.lineStyle(10 * (1 - k), JUDGE_COLORS[s.judged], 1 - k).strokeCircle(cx, 150, 60 + 50 * k);
    }
    // Power, as a battery filling up (the round's best fills it).
    const best = Math.max(1, ...v.boards.map((b) => b.boardScore));
    const fill = Math.min(1, s.power / best);
    block(g, 36, 256, BOARD_W - 72, 138, STONE);
    g.fillStyle(INK, 1).fillRoundedRect(46, 266, BOARD_W - 92, 112, 8);
    if (fill > 0.01) block(g, 48, 268, Math.max(30, (BOARD_W - 96) * fill), 108, s.overloadMs > 0 ? DANGER : GOOD);
    block(g, BOARD_W - 38, 296, 16, 74, STONE);
  }
}
