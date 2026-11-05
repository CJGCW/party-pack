import Phaser from 'phaser';
import { DANGER, FIRE, INK, SKY, glow } from '../art';
import type { BoardsHostView } from '../../../shared/boards';
import {
  BOARD_SIZE,
  TUBES,
  hazardsFor,
  laneAt,
  tubeById,
  tubePoint,
  type Hazard,
  type TempestBoardState,
  type TempestRound,
} from '../../../shared/games/tempestRun';
import { BoardsScene, type BoardSlot } from '../boardsScene';
import { hex } from '../theme';

type Slot = BoardSlot<TempestBoardState, TempestBoardState>;

/** Hazards look further off than they are at first, then rush up: depth on screen from depth in time. */
const perspective = (d: number) => d * d;

/**
 * The TV during Tempest Run: everyone's tube side by side (see ../boardsScene). The hazards come
 * from the round's seed, so the TV works them out itself; only each player's place on the rim
 * comes from the server.
 */
export class TempestRunScene extends BoardsScene<TempestBoardState, TempestRound> {
  static readonly KEY = 'tempest-run';
  protected readonly title = 'TEMPEST RUN';
  protected readonly scoring = 'survival';
  protected readonly boardW = BOARD_SIZE;
  protected readonly boardH = BOARD_SIZE;
  private tube = TUBES[0];
  private hazards: Hazard[] = [];
  private hazardsKey = '';
  /** The round's clock: it read `roundMs` at `at` (performance.now). */
  private clock = { roundMs: 0, at: 0, playing: false };

  constructor() {
    super(TempestRunScene.KEY);
  }

  protected roundLabel(view: BoardsHostView<TempestBoardState, TempestRound>) {
    this.tube = tubeById(view.round.tubeId);
    const key = `${view.seed}|${this.tube.id}`;
    if (key !== this.hazardsKey) {
      this.hazardsKey = key;
      this.hazards = hazardsFor(view.seed, this.tube);
    }
    this.clock = { roundMs: view.roundMs, at: performance.now(), playing: view.phase === 'play' };
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles} · ${this.tube.name}`;
  }

  protected layoutKey(view: BoardsHostView<TempestBoardState, TempestRound>) {
    return view.round.tubeId;
  }

  protected statusText() {
    return '';
  }

  /** The tube: its rim, its far end, and the lines between lanes. */
  protected drawStatic(_slot: Slot, g: Phaser.GameObjects.Graphics) {
    const tube = this.tube;
    const edges = tube.closed ? tube.lanes : tube.lanes + 1;
    g.lineStyle(4, SKY, 0.35);
    for (let i = 0; i < edges; i++) {
      const a = tube.start + i * tube.span;
      const near = tubePoint(tube, a, 1);
      const far = tubePoint(tube, a, 0);
      g.lineBetween(near.x, near.y, far.x, far.y);
    }
    for (const depth of [1, 0]) {
      const pts: Phaser.Math.Vector2[] = [];
      const steps = tube.lanes * 8;
      for (let i = 0; i <= steps; i++) {
        const p = tubePoint(tube, tube.start + (i / steps) * tube.lanes * tube.span, depth);
        pts.push(new Phaser.Math.Vector2(p.x, p.y));
      }
      if (depth) g.lineStyle(16, SKY, 0.16).strokePoints(pts, tube.closed);
      g.lineStyle(depth ? 8 : 4, SKY, depth ? 0.9 : 0.5).strokePoints(pts, tube.closed);
    }
  }

  protected drawBoard(slot: Slot, g: Phaser.GameObjects.Graphics, t: number) {
    const tube = this.tube;
    const prev = slot.prev!.snap;
    const curr = slot.curr!.snap;
    // The short way round between updates.
    let diff = curr.position - prev.position;
    if (tube.closed) diff = ((((diff + tube.lanes / 2) % tube.lanes) + tube.lanes) % tube.lanes) - tube.lanes / 2;
    const position = prev.position + diff * t;
    const color = hex(slot.board.color);
    const lane = laneAt(tube, position);

    // Light up the lane they're in.
    const a0 = tube.start + lane * tube.span;
    const lanePts = [tubePoint(tube, a0, 1), tubePoint(tube, a0 + tube.span, 1), tubePoint(tube, a0 + tube.span, 0), tubePoint(tube, a0, 0)];
    g.fillStyle(color, 0.16).fillPoints(lanePts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);

    // Hazards climbing the tube.
    const ms = this.clock.playing ? this.clock.roundMs + (performance.now() - this.clock.at) : this.clock.roundMs;
    for (const h of this.hazards) {
      if (ms < h.spawnMs || ms > h.arriveMs + 120) continue;
      const d = perspective(Math.min(1, (ms - h.spawnMs) / (h.arriveMs - h.spawnMs)));
      const a = tube.start + (h.lane + 0.5) * tube.span;
      const half = tube.span * 0.38;
      const p1 = tubePoint(tube, a - half, d);
      const p2 = tubePoint(tube, a + half, d);
      const tip = tubePoint(tube, a, Math.max(0, d - 0.06));
      const back = tubePoint(tube, a, Math.min(1, d + 0.03));
      const near = d > 0.82;
      const shape = [p1, tip, p2, back].map((p) => new Phaser.Math.Vector2(p.x, p.y));
      if (near) glow(g, back.x, back.y, 70, DANGER);
      g.fillStyle(near ? DANGER : FIRE, 1).fillPoints(shape, true);
      g.lineStyle(3, INK, 1).strokePoints(shape, true);
    }

    // The player: a claw on the rim.
    const a = tube.start + position * tube.span;
    const half = tube.span * 0.45;
    const left = tubePoint(tube, a - half, 1.04);
    const right = tubePoint(tube, a + half, 1.04);
    const point = tubePoint(tube, a, 0.9);
    const pulse = slot.board.endedAtMs === null ? 1 : 0.4;
    glow(g, (left.x + right.x) / 2, (left.y + right.y) / 2, 70, color, pulse);
    g.fillStyle(INK, pulse).fillTriangle(left.x, left.y, right.x, right.y, point.x, point.y);
    g.lineStyle(10, color, pulse).strokeTriangle(left.x, left.y, right.x, right.y, point.x, point.y);
  }
}
