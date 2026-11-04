import Phaser from 'phaser';
import type { BoardView } from '../../../shared/boards';
import { BOARD_H, BOARD_W, TOP, towerAt, type BlockView, type TowerState } from '../../../shared/games/idolTower';
import { BoardsScene, type BoardSlot } from '../boardsScene';

type Slot = BoardSlot<TowerState, TowerState>;

const FILLS: Record<BlockView['kind'], number> = { wood: 0xc8934f, stone: 0x7d7896, idol: 0xffd166 };

/** A box's corners, turned `a` (radians, clockwise) round its middle. */
function corners(x: number, y: number, hw: number, hh: number, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([px, py]) => new Phaser.Math.Vector2(x + px * c - py * s, y + px * s + py * c));
}

/** The TV during Idol Tower: everyone's tower side by side (see ../boardsScene), each tap's settling played as it comes in. */
export class IdolTowerScene extends BoardsScene<TowerState> {
  static readonly KEY = 'idol-tower';
  protected readonly title = 'IDOL TOWER';
  protected readonly scoring = 'race';
  protected readonly boardW = BOARD_W;
  protected readonly boardH = BOARD_H;
  /** When each board's last tap started playing. */
  private playing = new Map<string, number>();

  constructor() {
    super(IdolTowerScene.KEY);
  }

  protected statusText(board: BoardView<TowerState>) {
    const s = board.state;
    return `${s.removed}/${s.removable}${s.falls ? ` · ${s.falls} fall${s.falls === 1 ? '' : 's'}` : ''}`;
  }

  protected onSnapshot(slot: Slot, prev: TowerState, next: TowerState) {
    if (next.moveId !== prev.moveId) this.playing.set(slot.playerId, performance.now());
  }

  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    g.fillGradientStyle(0x5ec8f2, 0x5ec8f2, 0xbfe9ff, 0xbfe9ff, 1).fillRect(0, TOP, BOARD_W, BOARD_H - TOP);
    g.fillStyle(0x4cae5c, 1).fillRect(0, BOARD_H - 6, BOARD_W, 6);
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics) {
    const s = slot.curr!.snap;
    const from = this.playing.get(slot.playerId);
    const blocks = towerAt(s, from === undefined ? null : (performance.now() - from) / 1000);
    for (const b of blocks) {
      g.fillStyle(0x140f2e, 1).fillPoints(corners(b.x, b.y, b.hw + 2, b.hh + 2, b.a), true);
      g.fillStyle(FILLS[b.kind], 1).fillPoints(corners(b.x, b.y, b.hw, b.hh, b.a), true);
      if (b.kind === 'idol') {
        const eye = corners(b.x, b.y, b.hw * 0.45, b.hh * 0.25, b.a);
        g.fillStyle(0x140f2e, 1).fillCircle(eye[0].x, eye[0].y, 3).fillCircle(eye[1].x, eye[1].y, 3);
      }
    }
  }
}
