import Phaser from 'phaser';
import { DANGER, GOLD, GOOD, STONE, ball, block, checkerFloor, glow, shade } from '../art';
import { burst, popText } from '../fx';
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

  protected onSnapshot(slot: Slot, prev: DodgeState, next: DodgeState) {
    if (next.deaths > prev.deaths) {
      const at = this.screenOf(slot, prev.x, prev.y);
      burst(this, at.x, at.y, hex(slot.board.color), 30);
    }
    if (next.coins.length > prev.coins.length) {
      const at = this.screenOf(slot, next.x, next.y);
      burst(this, at.x, at.y, GOLD, 16);
      popText(this, at.x, at.y - 20, `${next.coins.length}/${DODGE_LEVELS[next.level].coins.length}`, '#ffd166', 30);
    }
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
      back.clear();
      checkerFloor(back, 0, 0, Math.ceil(BOARD_W / 50), Math.ceil(BOARD_H / 50), 50);
      back.fillStyle(shade(GOOD, -0.45), 1).fillRect(...level.start).fillRect(...level.goal);
      for (const c of level.checkpoints) back.fillStyle(shade(GOOD, -0.45), 1).fillRect(...c);
      for (const w of level.walls) block(back, w[0], w[1], w[2], w[3], STONE);
    }
    const ms = v.phase === 'play' ? v.roundMs + (performance.now() - slot.curr!.at) : 0;
    const got = new Set(s.coins);
    level.coins.forEach(([x, y], i) => {
      if (got.has(i)) return;
      glow(g, x, y, COIN_R * 2.8, GOLD);
      ball(g, x, y, COIN_R, GOLD);
    });
    for (const p of level.dots) {
      const d = dotAt(p, ms);
      ball(g, d.x, d.y, DOT_R, DANGER);
    }
    // Back to the start after a hit: no sliding there.
    const jumped = Math.hypot(prev.x - s.x, prev.y - s.y) > 60;
    const x = jumped ? s.x : lerp(prev.x, s.x, t);
    const y = jumped ? s.y : lerp(prev.y, s.y, t);
    block(g, x - BOX_HALF - 3, y - BOX_HALF - 3, BOX_HALF * 2 + 6, BOX_HALF * 2 + 6, hex(slot.board.color));
  }
}
