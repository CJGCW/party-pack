import Phaser from 'phaser';
import { FLOOR_A, FLOOR_DARK, GOLD, GOOD, INK, SKY, STONE, ball, shade, softShadow } from '../art';
import { burst } from '../fx';
import type { BoardView } from '../../../shared/boards';
import { BALL_R, COURSES, TILE, type MarbleState } from '../../../shared/games/marbleRally';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<MarbleState, MarbleState>;

/** Big enough for every course. */
const COLS = Math.max(...COURSES.map((c) => c.rows[0].length));
const ROWS = Math.max(...COURSES.map((c) => c.rows.length));
const BOARD_W = COLS * TILE;
const BOARD_H = ROWS * TILE + 30;
const TOP = 30;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The track's side, drawn below each tile for a bit of depth. */
const DEPTH = 12;

/** The TV during Marble Rally: everyone's course side by side (see ../boardsScene), floating in the sky, and their marble on it. */
export class MarbleRallyScene extends BoardsScene<MarbleState> {
  static readonly KEY = 'marble-rally';
  protected readonly title = 'MARBLE RALLY';
  protected readonly scoring = 'race';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  private drawn = new Map<string, Phaser.GameObjects.Graphics>();

  constructor() {
    super(MarbleRallyScene.KEY);
  }

  protected statusText(board: BoardView<MarbleState>) {
    return `${board.state.checkpoints} checkpoints · ${board.state.falls} falls`;
  }

  protected onSnapshot(slot: Slot, prev: MarbleState, next: MarbleState) {
    if (next.checkpoints > prev.checkpoints) {
      const at = this.screenOf(slot, next.x * TILE, TOP + next.y * TILE);
      burst(this, at.x, at.y, GOOD, 24);
    }
  }

  /** The course is drawn on the first update (the board doesn't know which before then). */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    this.drawn.set(slot.playerId, g);
    g.setData('course', -1);
  }

  private drawCourse(g: Phaser.GameObjects.Graphics, course: number) {
    g.clear().fillGradientStyle(FLOOR_DARK, FLOOR_DARK, FLOOR_A, FLOOR_A, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const rows = COURSES[course].rows;
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const px = x * TILE;
        const py = TOP + y * TILE;
        g.fillStyle(shade(STONE, -0.45), 1).fillRect(px, py + TILE, TILE, DEPTH);
        const color = ch === 'G' ? GOLD : ch === 'C' ? GOOD : ch === 'S' ? SKY : '<>^v'.includes(ch) ? shade(STONE, 0.25) : shade(STONE, 0.45);
        g.fillStyle(color, 1).fillRect(px, py, TILE, TILE);
        g.fillStyle(0xffffff, 0.12).fillRect(px, py, TILE, 4);
        g.lineStyle(2, INK, 0.5).strokeRect(px, py, TILE, TILE);
        if ('<>^v'.includes(ch)) {
          // Arrows downhill.
          const [dx, dy] = ch === '>' ? [1, 0] : ch === '<' ? [-1, 0] : ch === 'v' ? [0, 1] : [0, -1];
          const cx = px + TILE / 2;
          const cy = py + TILE / 2;
          g.fillStyle(INK, 0.6).fillTriangle(cx + dx * 14, cy + dy * 14, cx - dx * 8 - dy * 10, cy - dy * 8 + dx * 10, cx - dx * 8 + dy * 10, cy - dy * 8 - dx * 10);
        }
      }),
    );
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number) {
    const prev = slot.prev!.snap;
    const s = slot.curr!.snap;
    const back = this.drawn.get(slot.playerId);
    if (back && back.getData('course') !== s.course) {
      back.setData('course', s.course);
      this.drawCourse(back, s.course);
    }
    // Back at a checkpoint after a fall: no sliding there.
    const jumped = Math.hypot(prev.x - s.x, prev.y - s.y) > 1;
    const x = (jumped ? s.x : lerp(prev.x, s.x, t)) * TILE;
    const y = TOP + (jumped ? s.y : lerp(prev.y, s.y, t)) * TILE;
    const r = BALL_R * TILE * (1 - s.falling * 0.8);
    softShadow(g, x + 3, y + r * 0.8, r * 2, r * 1.1, 0.3 * (1 - s.falling));
    ball(g, x, y + s.falling * 30, r, hex(slot.board.color));
  }
}
