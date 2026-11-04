import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_W, type BeatRound, type BeatState, type Judgement } from '../../../shared/games/powerBeat';
import { serverNow } from '../../clock';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<BeatState, BeatState>;

/** A judgement shows for this long. */
const JUDGE_MS = 450;
const JUDGE_COLORS: Record<Judgement, number> = { perfect: 0xffd166, good: 0x4cd37a, off: 0x9a93b8, overload: 0xff5d73 };

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
    if (next.judgedId !== prev.judgedId) this.judgedAt.set(slot.playerId, performance.now());
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x1d1640, 1).fillRect(0, 0, BOARD_W, BOARD_H);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const v = this.view!;
    const s = slot.curr!.snap;
    const round = v.round;
    // The beat: a pulse that flashes on each beat and fades.
    const sinceBeat = round && v.phase === 'play' ? (((serverNow() - round.epoch) % round.period) + round.period) % round.period : round?.period ?? 1;
    const pulse = Math.max(0, 1 - sinceBeat / 250);
    const cx = BOARD_W / 2;
    g.fillStyle(hex(slot.board.color), 0.15 + 0.5 * pulse).fillCircle(cx, 150, 70 + 18 * pulse);
    g.fillStyle(0x140f2e, 1).fillCircle(cx, 150, 56);
    g.fillStyle(hex(slot.board.color), 1).fillCircle(cx, 150, 50);
    // A bolt in the middle.
    g.fillStyle(0xffd166, 1).fillTriangle(cx + 6, 112, cx - 20, 156, cx + 2, 156).fillTriangle(cx - 6, 188, cx + 20, 144, cx - 2, 144);
    // The last tap's judgement, as a ring.
    const at = this.judgedAt.get(slot.playerId);
    if (at !== undefined && s.judged) {
      const k = (performance.now() - at) / JUDGE_MS;
      if (k < 1) g.lineStyle(10 * (1 - k), JUDGE_COLORS[s.judged], 1 - k).strokeCircle(cx, 150, 60 + 50 * k);
    }
    // Power, as a battery filling up (the round's best fills it).
    const best = Math.max(1, ...v.boards.map((b) => b.boardScore));
    const fill = Math.min(1, s.power / best);
    g.fillStyle(0x140f2e, 1).fillRoundedRect(40, 260, BOARD_W - 80, 130, 12);
    g.fillStyle(s.overloadMs > 0 ? 0xff5d73 : 0x4cd37a, 1).fillRoundedRect(48, 268, (BOARD_W - 96) * fill, 114, 8);
    g.fillStyle(0x140f2e, 1).fillRect(BOARD_W - 40, 300, 12, 66);
  }
}
