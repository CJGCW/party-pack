import Phaser from 'phaser';
import type { RoomState, SpinState } from '../../../shared/protocol';
import { listen, net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

const CENTER_X = WIDTH / 2;
const CENTER_Y = 590;
const RADIUS = 360;
/** Full turns before slowing to a stop. */
const TURNS = 6;

const SLICE_COLORS = ['#ff5d73', '#5ec8f2', '#ffd166', '#8b7cf6', '#6ee7b7', '#f472d0', '#ffb347', '#4cc9a0'];

/** Spins a wheel of game slices and lands the arrow on the server's chosen game. */
export class SpinnerScene extends Phaser.Scene {
  static readonly KEY = 'Spinner';

  private wheel: Phaser.GameObjects.Container | null = null;
  private arrow!: Phaser.GameObjects.Container;
  private labels: Phaser.GameObjects.Text[] = [];
  private sliceDeg = 360;
  private lastSlice = -1;
  private spinKey = '';
  private announce!: Phaser.GameObjects.Container;
  /** Everything drawn for the current spin, rebuilt each round. */
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super(SpinnerScene.KEY);
  }

  create() {
    this.spinKey = '';
    this.lastSlice = -1;
    this.wheel = null; // the scene object is reused each time the scene starts
    addBackdrop(this);
    this.layer = this.add.container(0, 0);
    this.announce = this.add.container(CENTER_X, CENTER_Y).setDepth(30);

    listen(this, 'room', (s: RoomState) => this.applyState(s));
    if (net.room) this.applyState(net.room);
  }

  update() {
    if (!this.wheel) return;
    // Flick the arrow each time a slice boundary passes under it, like a real wheel's clicker.
    const slice = this.sliceUnderArrow();
    if (slice !== this.lastSlice) {
      if (this.lastSlice !== -1) {
        this.tweens.killTweensOf(this.arrow);
        this.arrow.setAngle(-18);
        this.tweens.add({ targets: this.arrow, angle: 0, duration: 90, ease: 'Back.easeOut' });
      }
      this.lastSlice = slice;
    }
  }

  private applyState(state: RoomState) {
    if (!state.spin || !state.session) return;
    const key = `${state.session.round}`;
    if (key === this.spinKey) return;
    this.spinKey = key;
    this.buildWheel(state.spin, state);
    this.startSpin(state.spin);
  }

  private sliceUnderArrow(): number {
    // Slices are laid out clockwise from the top, and the arrow points down at the top,
    // so the slice under it is found by undoing the wheel's rotation.
    const local = Phaser.Math.Angle.WrapDegrees(-(this.wheel?.angle ?? 0));
    const offset = (local + 360) % 360;
    return Math.floor(offset / this.sliceDeg);
  }

  private buildWheel(spin: SpinState, state: RoomState) {
    this.layer.removeAll(true);
    this.announce.removeAll(true);

    const { entries } = spin;
    const round = state.session!;
    this.layer.add(text(this, CENTER_X, 70, `Round ${round.round} of ${round.totalRounds}`, 52, COLORS.accent, { fontStyle: '700' }));
    this.renderScores(state);

    this.sliceDeg = 360 / entries.length;
    const wheel = this.add.container(CENTER_X, CENTER_Y);
    this.wheel = wheel;
    this.layer.add(wheel);
    const g = this.add.graphics();
    entries.forEach((_, i) => {
      const start = Phaser.Math.DegToRad(-90 + i * this.sliceDeg);
      const end = Phaser.Math.DegToRad(-90 + (i + 1) * this.sliceDeg);
      g.fillStyle(hex(SLICE_COLORS[i % SLICE_COLORS.length]), 1);
      g.slice(0, 0, RADIUS, start, end, false);
      g.fillPath();
      g.lineStyle(6, 0x140f2e, 1);
      g.slice(0, 0, RADIUS, start, end, false);
      g.strokePath();
    });
    g.lineStyle(14, 0xffffff, 1);
    g.strokeCircle(0, 0, RADIUS);
    wheel.add(g);

    // Labels read outward from the hub along the middle of each slice.
    this.labels = entries.map((entry, i) => {
      const mid = -90 + (i + 0.5) * this.sliceDeg;
      const rad = Phaser.Math.DegToRad(mid);
      const size = entries.length > 6 ? 30 : 38;
      const label = text(this, Math.cos(rad) * RADIUS * 0.58, Math.sin(rad) * RADIUS * 0.58, entry.label, size, '#140f2e', {
        fontStyle: '700',
      }).setAngle(mid);
      // Shrink long names so they stay between the hub and the rim.
      const maxWidth = RADIUS * 0.7;
      if (label.width > maxWidth) label.setScale(maxWidth / label.width);
      wheel.add(label);
      return label;
    });

    const hub = this.add.circle(0, 0, 54, 0x140f2e).setStrokeStyle(10, 0xffffff);
    wheel.add(hub);

    // The arrow sits above the wheel pointing down at the top slice, pivoting near its top.
    this.arrow = this.add.container(CENTER_X, CENTER_Y - RADIUS - 30);
    this.layer.add(this.arrow);
    const a = this.add.graphics();
    a.fillStyle(0xffffff, 1);
    a.fillTriangle(-40, -30, 40, -30, 0, 70);
    a.fillStyle(0xff3355, 1);
    a.fillTriangle(-28, -22, 28, -22, 0, 52);
    a.fillStyle(0xffffff, 1);
    a.fillCircle(0, -30, 22);
    this.arrow.add(a);
  }

  private startSpin(spin: SpinState) {
    const offsetInSlice = Phaser.Math.FloatBetween(0.2, 0.8) * this.sliceDeg;
    // Rotating clockwise by R puts local angle -R under the arrow, so aim for minus the target.
    const finalAngle = TURNS * 360 - (spin.targetIndex * this.sliceDeg + offsetInSlice);
    const entry = spin.entries[spin.targetIndex];

    if (spin.stopsInMs <= 0) {
      // Joined after the wheel already stopped (e.g. the TV page was refreshed).
      this.wheel?.setAngle(finalAngle);
      this.lastSlice = this.sliceUnderArrow();
      this.showChosen(entry.label, spin.targetIndex);
      return;
    }

    this.wheel?.setAngle(0);
    this.lastSlice = this.sliceUnderArrow();
    this.tweens.addCounter({
      from: 0,
      to: finalAngle,
      duration: spin.stopsInMs,
      ease: 'Quart.easeOut',
      onUpdate: (tween) => this.wheel?.setAngle(tween.getValue() ?? 0),
      onComplete: () => this.showChosen(entry.label, spin.targetIndex),
    });
  }

  private showChosen(label: string, index: number) {
    const chosen = this.labels[index];
    this.tweens.add({ targets: chosen, scale: chosen.scale * 1.25, duration: 300, yoyo: true, repeat: 2 });
    const banner = text(this, 0, 0, label.toUpperCase(), 84, COLORS.text, {
      fontStyle: '700',
      stroke: '#140f2e',
      strokeThickness: 12,
    }).setScale(0);
    this.announce.add(banner);
    this.tweens.add({ targets: banner, scale: 1, duration: 500, ease: 'Back.easeOut' });
    burstConfetti(this, CENTER_X - 300, CENTER_Y, 60);
    burstConfetti(this, CENTER_X + 300, CENTER_Y, 60);
  }

  /** Running totals, once there are any. */
  private renderScores(state: RoomState) {
    const players = [...state.players].sort((a, b) => b.score - a.score);
    if (!players.some((p) => p.score > 0)) return;
    const line = players.map((p) => `${p.name} ${p.score.toLocaleString()}`).join('     ');
    this.layer.add(text(this, CENTER_X, HEIGHT - 40, line, 30, COLORS.muted));
  }
}
