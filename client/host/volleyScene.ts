import Phaser from 'phaser';
import type { VolleyBoardView, VolleyHostView } from '../../shared/volleys';
import { AREA, GAP, gridFor } from './boardsScene';
import { boxGlow, burst, resultCard, shockwave } from './fx';
import { GameHud } from './hud';
import { listen, net } from './net';
import { showRoundScores } from './roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, text } from './theme';

/** One player's board on screen. */
export interface VolleySlot<S> {
  playerId: string;
  /** Where it is on screen, and how many screen pixels a board unit is. */
  x: number;
  y: number;
  scale: number;
  container: Phaser.GameObjects.Container;
  /** Cleared and redrawn every frame. */
  dynamic: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  statText: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  banner: Phaser.GameObjects.Container;
  board: VolleyBoardView<S>;
}

/**
 * The TV for a volleys game (see shared/volleys.ts): a board per player in a grid. While aiming,
 * each shows its player aiming (and READY once they've fired); then the shots play back, all at
 * once, from the recordings; then the result and round scores. A game says how big its boards are
 * and draws them.
 */
export abstract class VolleyScene<S> extends Phaser.Scene {
  protected abstract readonly title: string;
  protected abstract readonly boardW: number;
  protected abstract readonly boardH: number;
  /** What a shot's called in the header ("Shot 2 of 3"). */
  protected shotWord = 'Shot';

  protected view: VolleyHostView<S> | null = null;
  protected slots: VolleySlot<S>[] = [];
  private slotsKey = '';
  private phaseKey = '';
  private phaseEndsAt = 0;
  /** When this volley's shots started playing (performance.now()). */
  protected flyStartedAt = 0;
  private hud!: GameHud;
  private boardLayer!: Phaser.GameObjects.Container;
  protected overlay!: Phaser.GameObjects.Container;

  /** Draws what doesn't change all round (scenery), once a round. */
  protected abstract drawStatic(slot: VolleySlot<S>, g: Phaser.GameObjects.Graphics): void;
  /** Draws the board every frame: aiming, or `seconds` into playing its shot back. */
  protected abstract drawBoard(slot: VolleySlot<S>, g: Phaser.GameObjects.Graphics, seconds: number, time: number): void;
  /** The board's corner label. */
  protected statusText(board: VolleyBoardView<S>) {
    return String(board.boardScore);
  }
  /** The board's result title. */
  protected resultTitle(board: VolleyBoardView<S>) {
    return `${board.boardScore}`;
  }

  create() {
    this.view = null;
    this.slots = [];
    this.slotsKey = this.phaseKey = '';
    addBackdrop(this);
    this.boardLayer = this.add.container(0, 0);
    this.hud = new GameHud(this, this.title);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: VolleyHostView<S>) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as VolleyHostView<S>);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  private applyView(view: VolleyHostView<S>) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.hud.setHeader(`Round ${view.puzzleNumber} of ${view.totalPuzzles} · ${this.shotWord} ${view.volley} of ${view.totalVolleys}`);
    const key = `${view.puzzleNumber}|${view.boards.map((b) => b.playerId).join(',')}`;
    if (key !== this.slotsKey) {
      this.slotsKey = key;
      this.buildSlots(view.boards);
    }
    for (const slot of this.slots) slot.board = view.boards.find((b) => b.playerId === slot.playerId) ?? slot.board;

    const phaseKey = `${view.puzzleNumber}|${view.volley}|${view.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.overlay.removeAll(true);
      for (const slot of this.slots) slot.banner.removeAll(true);
      if (view.phase === 'fly') this.flyStartedAt = performance.now();
      if (view.phase === 'result') {
        for (const slot of this.slots) this.showResult(slot);
        if (this.slots.some((s) => s.board.boardScore > 0)) burstConfetti(this, WIDTH / 2, 360, 60);
      }
      if (view.phase === 'gameEnd') {
        showRoundScores(
          this,
          this.overlay,
          view.boards.map((b) => ({ name: b.name, color: b.color, points: view.gamePoints[b.playerId] ?? 0 })),
        );
      }
    }
    for (const slot of this.slots) {
      slot.statText.setText(this.statusText(slot.board));
      slot.badge.setVisible(view.phase === 'aim' && slot.board.locked);
    }
  }

  private buildSlots(boards: VolleyBoardView<S>[]) {
    this.boardLayer.removeAll(true);
    const { boardW: w, boardH: h } = this;
    const { cols, rows, scale } = gridFor(Math.max(1, boards.length), w, h);
    const gridW = cols * w * scale + (cols - 1) * GAP;
    const gridH = rows * h * scale + (rows - 1) * GAP;
    // Wide, low boards still want a name you can read.
    const label = Math.max(Math.min(w, h) * 0.06, 20);
    const corner = Math.min(w, h) * 0.04;
    this.slots = boards.map((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? boards.length - row * cols : cols;
      const rowW = inRow * w * scale + (inRow - 1) * GAP;
      const x = AREA.x + (AREA.w - gridW) / 2 + (gridW - rowW) / 2 + col * (w * scale + GAP);
      const y = AREA.y + (AREA.h - gridH) / 2 + row * (h * scale + GAP);
      const container = this.add.container(x, y).setScale(scale);
      const clip = this.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(x, y, w * scale, h * scale, corner * scale);
      container.setMask(clip.createGeometryMask());
      this.boardLayer.add(container);
      this.boardLayer.addAt(boxGlow(this, x, y, w * scale, h * scale, corner * scale, hex(b.color)), 0);
      const g = this.add.graphics();
      const slot: VolleySlot<S> = {
        playerId: b.playerId,
        x,
        y,
        scale,
        container,
        dynamic: this.add.graphics(),
        nameText: text(this, label * 0.8, label * 0.85, b.name, label, b.color, { fontStyle: '700', stroke: '#140f2e', strokeThickness: label * 0.15 }).setOrigin(0, 0.5),
        statText: text(this, w - label * 0.8, label * 0.85, '', label * 0.8, COLORS.text, { fontStyle: '700', stroke: '#140f2e', strokeThickness: label * 0.15 }).setOrigin(1, 0.5),
        badge: text(this, w / 2, label * 2.2, 'READY', label * 1.1, COLORS.accent, { fontStyle: '700', stroke: '#140f2e', strokeThickness: label * 0.2 }).setVisible(false),
        banner: this.add.container(w / 2, h / 2),
        board: b,
      };
      container.add([g, slot.dynamic]);
      this.drawStatic(slot, g);
      const edge = this.add.graphics();
      edge.lineStyle(Math.min(w, h) * 0.01, hex(b.color), 0.9).strokeRoundedRect(0, 0, w, h, corner);
      container.add([edge, slot.nameText, slot.statText, slot.badge, slot.banner]);
      return slot;
    });
  }

  private showResult(slot: VolleySlot<S>) {
    const b = slot.board;
    const size = Math.min(this.boardW, this.boardH);
    const good = b.place === 1;
    slot.banner.add(resultCard(this, this.boardW * 0.7, size * 0.36, hex(good ? COLORS.accent : COLORS.muted), good));
    slot.banner.add(text(this, 0, -size * 0.08, this.resultTitle(b), size * 0.09, good ? COLORS.accent : COLORS.text, { fontStyle: '700' }));
    slot.banner.add(text(this, 0, size * 0.07, `+${b.points.toLocaleString()}`, size * 0.12, COLORS.text, { fontStyle: '700' }));
    slot.banner.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: slot.banner, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    if (good) {
      const [x, y] = [slot.x + (this.boardW * slot.scale) / 2, slot.y + (this.boardH * slot.scale) / 2];
      burst(this, x, y, hex(COLORS.accent), 50);
      shockwave(this, x, y, hex(COLORS.accent), (size * slot.scale) / 2);
    }
  }

  update(time: number) {
    const v = this.view;
    if (!v) return;
    const now = performance.now();
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000));
    this.hud.clock(v.phase === 'aim' ? secs : null, 5);
    const seconds = v.phase === 'fly' ? (now - this.flyStartedAt) / 1000 : 0;
    for (const slot of this.slots) this.drawBoard(slot, slot.dynamic.clear(), seconds, time);
  }
}
