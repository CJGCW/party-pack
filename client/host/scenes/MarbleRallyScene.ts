import Phaser from 'phaser';
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

  /** The course is drawn on the first update (the board doesn't know which before then). */
  protected drawStatic(slot: Slot, g: Phaser.GameObjects.Graphics) {
    this.drawn.set(slot.playerId, g);
    g.setData('course', -1);
  }

  private drawCourse(g: Phaser.GameObjects.Graphics, course: number) {
    g.clear().fillGradientStyle(0x3a2f6e, 0x3a2f6e, 0x8b7cf6, 0x8b7cf6, 1).fillRect(0, 0, BOARD_W, BOARD_H);
    const rows = COURSES[course].rows;
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const px = x * TILE;
        const py = TOP + y * TILE;
        g.fillStyle(0x4a3f9a, 1).fillRect(px, py + TILE, TILE, DEPTH);
        const color = ch === 'G' ? 0xffd166 : ch === 'C' ? 0x4cd37a : ch === 'S' ? 0x5ec8f2 : '<>^v'.includes(ch) ? 0xc8bfff : 0xe8e4ff;
        g.fillStyle(color, 1).fillRect(px, py, TILE, TILE);
        g.lineStyle(1, 0x9a93b8, 0.5).strokeRect(px, py, TILE, TILE);
        if ('<>^v'.includes(ch)) {
          // Arrows downhill.
          const [dx, dy] = ch === '>' ? [1, 0] : ch === '<' ? [-1, 0] : ch === 'v' ? [0, 1] : [0, -1];
          const cx = px + TILE / 2;
          const cy = py + TILE / 2;
          g.fillStyle(0x8b7cf6, 1).fillTriangle(cx + dx * 14, cy + dy * 14, cx - dx * 8 - dy * 10, cy - dy * 8 + dx * 10, cx - dx * 8 + dy * 10, cy - dy * 8 - dx * 10);
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
    g.fillStyle(0x000000, 0.25 * (1 - s.falling)).fillEllipse(x + 4, y + 6, r * 2, r * 1.2);
    g.fillStyle(0x140f2e, 1).fillCircle(x, y + s.falling * 30, r + 3);
    g.fillStyle(hex(slot.board.color), 1).fillCircle(x, y + s.falling * 30, r);
    g.fillStyle(0xffffff, 0.5).fillCircle(x - r * 0.35, y - r * 0.35 + s.falling * 30, r * 0.3);
  }
}
