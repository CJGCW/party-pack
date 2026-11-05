import Phaser from 'phaser';
import type { BoardView, BoardsHostView, BoardsScoring } from '../../shared/boards';
import { boxGlow, burst, impact, popText, resultCard, shockwave } from './fx';
import { GameHud } from './hud';
import { listen, net } from './net';
import { showRoundScores } from './roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from './theme';

/** The boards fill this area, in a grid. */
export const AREA = { x: 20, y: 130, w: WIDTH - 40, h: HEIGHT - 145 };
export const GAP = 16;

/** One player's board on screen, and the last two updates of it to move smoothly between. */
export interface BoardSlot<S, Snap> {
  playerId: string;
  /** Where it is on screen, and how many screen pixels a board unit is. */
  x: number;
  y: number;
  scale: number;
  /** Everything on it is in board units, inside this. */
  container: Phaser.GameObjects.Container;
  /** Cleared and redrawn every frame. */
  dynamic: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  statText: Phaser.GameObjects.Text;
  banner: Phaser.GameObjects.Container;
  prev: { at: number; snap: Snap } | null;
  curr: { at: number; snap: Snap } | null;
  board: BoardView<S>;
  /** The round `curr` is from (snapshots are only compared within a round). */
  puzzle: number;
}

/** The best grid for `n` boards of this shape in the area. */
export function gridFor(n: number, boardW: number, boardH: number) {
  let best = { cols: 1, rows: 1, scale: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const scale = Math.min((AREA.w - GAP * (cols - 1)) / cols / boardW, (AREA.h - GAP * (rows - 1)) / rows / boardH);
    if (scale > best.scale) best = { cols, rows, scale };
  }
  return best;
}

function ordinal(n: number) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/**
 * The TV for a side-by-side boards game (see shared/boards.ts): a board per player in a grid, the
 * countdown, a banner on each board when its run ends, the result and round scores. A game says
 * how big its boards are and draws them; updates come about 15 times a second and each frame
 * gets how far it is between the last two (`t`, 0 to 1), to move things smoothly.
 *
 * `S` is a board's state from the server, `R` the round's shared state, `Snap` what's kept of
 * each update to draw from (the state itself, unless the game unpacks it).
 */
export abstract class BoardsScene<S, R = null, Snap = S> extends Phaser.Scene {
  protected abstract readonly title: string;
  protected abstract readonly scoring: BoardsScoring;
  /** A board's size in its own units. */
  protected abstract readonly boardW: number;
  protected abstract readonly boardH: number;
  /** On a board as its run ends. */
  protected endedBanner = 'OUT!';

  protected view: BoardsHostView<S, R> | null = null;
  protected slots: BoardSlot<S, Snap>[] = [];
  private slotsKey = '';
  private phaseKey = '';
  private phaseEndsAt = 0;
  private hud!: GameHud;
  private boardLayer!: Phaser.GameObjects.Container;
  protected overlay!: Phaser.GameObjects.Container;

  /** Draws the parts of a board that don't move (over the plain board), once a round. */
  protected abstract drawStatic(slot: BoardSlot<S, Snap>, g: Phaser.GameObjects.Graphics): void;
  /** Draws the parts that move, every frame, `t` of the way from `slot.prev` to `slot.curr`. */
  protected abstract drawBoard(slot: BoardSlot<S, Snap>, g: Phaser.GameObjects.Graphics, t: number, time: number): void;
  /** What's kept of each update (the state as it is, unless the game unpacks it). */
  protected snapshot(board: BoardView<S>): Snap {
    return board.state as unknown as Snap;
  }
  /** Called with each new update while playing (e.g. to set off effects for what's changed). */
  protected onSnapshot(_slot: BoardSlot<S, Snap>, _prev: Snap, _next: Snap): void {}
  /** The header's text. */
  protected roundLabel(view: BoardsHostView<S, R>) {
    return `Round ${view.puzzleNumber} of ${view.totalPuzzles}`;
  }
  /** Anything that means the boards need laying out again (beyond a new round or new players). */
  protected layoutKey(_view: BoardsHostView<S, R>) {
    return '';
  }
  /** The board's corner label while its run's going. */
  protected statusText(board: BoardView<S>) {
    return this.scoring === 'best' ? String(board.boardScore) : '';
  }
  /** The board's result: a title, and what to say about how it did. */
  protected resultTitle(board: BoardView<S>): { title: string; good: boolean } {
    if (this.scoring === 'survival') {
      return board.endedAtMs === null ? { title: 'SURVIVED!', good: true } : { title: `OUT AT ${Math.floor(board.endedAtMs / 1000)}s`, good: false };
    }
    if (this.scoring === 'race') {
      return board.endedAtMs !== null ? { title: `DONE IN ${(board.endedAtMs / 1000).toFixed(1)}s`, good: true } : { title: "TIME'S UP", good: false };
    }
    return { title: `${ordinal(board.place ?? 1)}: ${board.boardScore}`, good: board.place === 1 };
  }
  /** Anything to set up before the first view (textures etc.). */
  protected setup(): void {}

  create() {
    this.view = null;
    this.slots = [];
    this.slotsKey = this.phaseKey = '';
    addBackdrop(this);
    this.setup();
    this.boardLayer = this.add.container(0, 0);
    this.hud = new GameHud(this, this.title);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: BoardsHostView<S, R>) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as BoardsHostView<S, R>);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  private applyView(view: BoardsHostView<S, R>) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.hud.setHeader(this.roundLabel(view));

    const key = `${view.puzzleNumber}|${this.layoutKey(view)}|${view.boards.map((b) => b.playerId).join(',')}`;
    if (key !== this.slotsKey) {
      this.slotsKey = key;
      this.buildSlots(view.boards);
    }
    const now = performance.now();
    for (const slot of this.slots) {
      const b = view.boards.find((o) => o.playerId === slot.playerId);
      if (!b) continue;
      const next = { at: now, snap: this.snapshot(b) };
      const sameRound = slot.puzzle === view.puzzleNumber;
      if (slot.curr && sameRound && view.phase === 'play') this.onSnapshot(slot, slot.curr.snap, next.snap);
      slot.prev = sameRound ? (slot.curr ?? next) : next;
      slot.puzzle = view.puzzleNumber;
      slot.curr = next;
      slot.board = b;
    }

    const phaseKey = `${view.puzzleNumber}|${view.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.overlay.removeAll(true);
      if (view.phase === 'result') {
        for (const slot of this.slots) this.showResult(slot);
        const celebrate =
          this.scoring === 'survival'
            ? this.slots.some((s) => s.board.endedAtMs === null)
            : this.scoring === 'race'
              ? this.slots.some((s) => s.board.endedAtMs !== null)
              : this.slots.some((s) => s.board.boardScore > 0);
        if (celebrate) burstConfetti(this, WIDTH / 2, HEIGHT / 3, 60);
        const top = Math.max(0, ...this.slots.map((s) => s.board.points));
        for (const slot of this.slots) if (top > 0 && slot.board.points === top) this.cheer(slot);
      }
      if (view.phase === 'gameEnd') {
        showRoundScores(
          this,
          this.overlay,
          view.boards.map((b) => ({ name: b.name, color: b.color, points: view.gamePoints[b.playerId] ?? 0 })),
        );
      }
    }
    for (const slot of this.slots) this.updateLabels(slot);
  }

  /** Lays out a board per player and draws what doesn't move. */
  private buildSlots(boards: BoardView<S>[]) {
    this.boardLayer.removeAll(true);
    const { boardW: w, boardH: h } = this;
    const { cols, rows, scale } = gridFor(Math.max(1, boards.length), w, h);
    const gridW = cols * w * scale + (cols - 1) * GAP;
    const gridH = rows * h * scale + (rows - 1) * GAP;
    const label = Math.min(w, h) * 0.052;
    this.slots = boards.map((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Centre a short last row.
      const inRow = row === rows - 1 ? boards.length - row * cols : cols;
      const rowW = inRow * w * scale + (inRow - 1) * GAP;
      const x = AREA.x + (AREA.w - gridW) / 2 + (gridW - rowW) / 2 + col * (w * scale + GAP);
      const y = AREA.y + (AREA.h - gridH) / 2 + row * (h * scale + GAP);
      const container = this.add.container(x, y).setScale(scale);
      // Nothing drawn on a board shows outside it.
      const clip = this.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(x, y, w * scale, h * scale, Math.min(w, h) * 0.04 * scale);
      container.setMask(clip.createGeometryMask());
      this.boardLayer.add(container);

      const g = this.add.graphics();
      const corner = Math.min(w, h) * 0.04;
      this.boardLayer.addAt(boxGlow(this, x, y, w * scale, h * scale, corner * scale, hex(b.color)), 0);
      g.fillGradientStyle(0x241c5a, 0x241c5a, 0x120d30, 0x120d30, 1);
      g.fillRect(0, 0, w, h);
      const slot: BoardSlot<S, Snap> = {
        playerId: b.playerId,
        x,
        y,
        scale,
        container,
        dynamic: this.add.graphics(),
        nameText: text(this, label * 0.8, label * 0.85, b.name, label, b.color, { fontStyle: '700', stroke: '#140f2e', strokeThickness: label * 0.14 }).setOrigin(0, 0.5),
        statText: text(this, w - label * 0.8, label * 0.85, '', label * 0.78, COLORS.muted, { fontStyle: '700', stroke: '#140f2e', strokeThickness: label * 0.14 }).setOrigin(1, 0.5),
        banner: this.add.container(w / 2, h / 2),
        prev: null,
        curr: null,
        board: b,
        puzzle: 0,
      };
      // The board and what moves on it first, so anything a game adds (labels…) sits over them.
      container.add([g, slot.dynamic]);
      this.drawStatic(slot, g);
      // The player's colour round the edge, then the labels and banner, over everything.
      const edge = this.add.graphics();
      edge.lineStyle(Math.min(w, h) * 0.012, hex(b.color), 1).strokeRoundedRect(0, 0, w, h, corner);
      container.add([edge, slot.nameText, slot.statText, slot.banner]);
      return slot;
    });
  }

  private updateLabels(slot: BoardSlot<S, Snap>) {
    const b = slot.board;
    const ended = b.endedAtMs !== null;
    slot.statText.setText(ended && this.scoring === 'survival' ? `OUT ${Math.floor(b.endedAtMs! / 1000)}s` : this.statusText(b));
    slot.statText.setColor(ended && this.scoring === 'survival' ? COLORS.danger : COLORS.text);
    // A board whose run's over gets a banner as soon as it happens (and dims, unless it finished a race).
    if (ended && slot.banner.length === 0 && this.view?.phase === 'play') {
      const size = Math.min(this.boardW, this.boardH);
      const finished = this.scoring === 'race';
      slot.banner.add(text(this, 0, 0, finished ? 'DONE!' : this.endedBanner, size * 0.2, finished ? COLORS.accent : COLORS.danger, { fontStyle: '700', stroke: '#140f2e', strokeThickness: size * 0.02 }));
      slot.banner.setScale(0.3);
      this.tweens.add({ targets: slot.banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
      const { x, y } = this.middleOf(slot);
      if (finished) {
        burst(this, x, y, hex(COLORS.accent), 40);
        shockwave(this, x, y, hex(COLORS.accent), (size * slot.scale) / 2);
      } else {
        burst(this, x, y, hex(COLORS.danger), 40);
        impact(this, 0.005);
      }
    }
  }

  /** Where a point on a board is on screen (effects are drawn in screen pixels). */
  protected screenOf(slot: BoardSlot<S, Snap>, x: number, y: number) {
    return { x: slot.x + x * slot.scale, y: slot.y + y * slot.scale };
  }

  /** The middle of a board, on screen. */
  private middleOf(slot: BoardSlot<S, Snap>) {
    return this.screenOf(slot, this.boardW / 2, this.boardH / 2);
  }

  /** The round's best: sparks and the points flying up off their board. */
  private cheer(slot: BoardSlot<S, Snap>) {
    const { x, y } = this.middleOf(slot);
    burst(this, x, y, hex(COLORS.accent), 50);
    shockwave(this, x, y, hex(COLORS.accent), (Math.min(this.boardW, this.boardH) * slot.scale) / 2);
    popText(this, x, y - (this.boardH * slot.scale) / 3, 'BEST!', COLORS.accent, 52);
  }

  private showResult(slot: BoardSlot<S, Snap>) {
    const b = slot.board;
    const size = Math.min(this.boardW, this.boardH);
    slot.banner.removeAll(true);
    const { title, good } = this.resultTitle(b);
    const color = good ? COLORS.accent : this.scoring === 'survival' ? COLORS.danger : COLORS.text;
    slot.banner.add(resultCard(this, this.boardW * 0.8, size * 0.33, hex(good ? COLORS.accent : COLORS.danger), good));
    slot.banner.add(text(this, 0, -size * 0.07, title, size * 0.09, color, { fontStyle: '700' }));
    slot.banner.add(text(this, 0, size * 0.06, `+${b.points.toLocaleString()}`, size * 0.11, COLORS.text, { fontStyle: '700' }));
    slot.banner.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: slot.banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
  }

  update(time: number) {
    const v = this.view;
    if (!v) return;
    const now = performance.now();
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000));
    this.hud.clock(v.phase === 'play' ? secs : null);
    this.hud.countdown(v.phase === 'ready' ? Math.max(1, secs) : null);
    for (const slot of this.slots) {
      const g = slot.dynamic.clear();
      if (!slot.prev || !slot.curr) continue;
      // Between the last two updates, a step behind, so it's always smooth.
      const span = Math.max(1, slot.curr.at - slot.prev.at);
      const t = Math.min(1, (now - slot.curr.at) / span);
      this.drawBoard(slot, g, t, time);
      slot.container.setAlpha(slot.board.endedAtMs !== null && v.phase === 'play' && this.scoring !== 'race' ? 0.55 : 1);
    }
  }
}
