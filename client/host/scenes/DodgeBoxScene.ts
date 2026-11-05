import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_W, BOX_HALF, COIN_R, DODGE_LEVELS, DOT_R, dotAt, type DodgeState } from '../../../shared/games/dodgeBox';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<DodgeState, DodgeState>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Dodge Box: everyone's copy of the level side by side (see ../boardsScene), the dots on patrol worked out from the clock. */
export class DodgeBoxScene extends BoardsScene<DodgeState> {
  static readonly KEY = 'dodge-box';
  protected readonly title = 'DODGE BOX';
  protected readonly scoring = 'race';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private drawn = new Map<string, Phaser.GameObjects.Graphics>();

  constructor() {
    super(DodgeBoxScene.KEY);
  }

  protected statusText(board: BoardView<DodgeState>) {
    const s = board.state;
    return `${s.coins.length}/${DODGE_LEVELS[s.level].coins.length} coins · ${s.deaths} hits`;
  }

  /** The level's drawn on the first update (the board doesn't know its level before then). */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    this.drawn.set(slot.playerId, g);
    g.setData('level', -1);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number) {
    const v = this.view!;
    const prev = slot.prev!.snap;
    const s = slot.curr!.snap;
    const level = DODGE_LEVELS[s.level];
    const back = this.drawn.get(slot.playerId);
    if (back && back.getData('level') !== s.level) {
      back.setData('level', s.level);
      back.clear().fillStyle(0xe8e4ff, 1).fillRect(0, 0, BOARD_W, BOARD_H);
      for (let y = 0; y < BOARD_H; y += 50) for (let x = (y / 50) % 2 ? 50 : 0; x < BOARD_W; x += 100) back.fillStyle(0xd8d2fa, 1).fillRect(x, y, 50, 50);
      back.fillStyle(0x9be8b0, 1).fillRect(...level.start).fillRect(...level.goal);
      for (const c of level.checkpoints) back.fillStyle(0x9be8b0, 1).fillRect(...c);
      for (const w of level.walls) back.fillStyle(0x2a2160, 1).fillRect(...w);
    }
    const ms = v.phase === 'play' ? v.roundMs + (performance.now() - slot.curr!.at) : 0;
    const got = new Set(s.coins);
    level.coins.forEach(([x, y], i) => {
      if (got.has(i)) return;
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, COIN_R + 3);
      g.fillStyle(0xffd166, 1).fillCircle(x, y, COIN_R);
    });
    for (const p of level.dots) {
      const d = dotAt(p, ms);
      g.fillStyle(0x140f2e, 1).fillCircle(d.x, d.y, DOT_R + 3);
      g.fillStyle(0x5e7cf2, 1).fillCircle(d.x, d.y, DOT_R);
    }
    // Back to the start after a hit: no sliding there.
    const jumped = Math.hypot(prev.x - s.x, prev.y - s.y) > 60;
    const x = jumped ? s.x : lerp(prev.x, s.x, t);
    const y = jumped ? s.y : lerp(prev.y, s.y, t);
    g.fillStyle(0x140f2e, 1).fillRect(x - BOX_HALF - 3, y - BOX_HALF - 3, BOX_HALF * 2 + 6, BOX_HALF * 2 + 6);
    g.fillStyle(hex(slot.board.color), 1).fillRect(x - BOX_HALF, y - BOX_HALF, BOX_HALF * 2, BOX_HALF * 2);
  }
}
