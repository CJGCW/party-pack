import Phaser from 'phaser';
import type { CallState, RoomState, SpinState } from '../../../shared/protocol';
import { listen, net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

const CENTER_X = WIDTH / 2;
const CENTER_Y = 590;
const RADIUS = 360;
/** Full turns before slowing to a stop. */
const TURNS = 6;

/** The calls panel, right of the wheel. */
const CALL_X = CENTER_X + RADIUS + 90;
const CALL_W = WIDTH - CALL_X - 40;

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
  /** Players calling the after-round game, once the wheel stops. */
  private callLayer!: Phaser.GameObjects.Container;
  private callTimer: Phaser.GameObjects.Text | null = null;
  private callEndsAt = 0;
  private callShowTimer: Phaser.Time.TimerEvent | null = null;

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
    this.callLayer = this.add.container(0, 0).setDepth(20);
    this.callTimer = null;

    listen(this, 'room', (s: RoomState) => this.applyState(s));
    if (net.room) this.applyState(net.room);
  }

  update() {
    this.callTimer?.setText(`Starting in ${Math.max(0, Math.ceil((this.callEndsAt - performance.now()) / 1000))}`);
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
    if (key !== this.spinKey) {
      this.spinKey = key;
      this.buildWheel(state.spin, state);
      this.startSpin(state.spin);
    }
    this.renderCalls(state.spin.call, state);
    this.callEndsAt = performance.now() + state.spin.msLeft;
    // The calls show once the wheel stops.
    this.callShowTimer?.remove();
    this.callLayer.setVisible(state.spin.stopsInMs <= 0);
    if (state.spin.stopsInMs > 0) this.callShowTimer = this.time.delayedCall(state.spin.stopsInMs, () => this.callLayer.setVisible(true));
  }

  /** Who's called what (the after-round game, see GameInfo.calls), and who can still call. */
  private renderCalls(call: CallState | null, state: RoomState) {
    this.callLayer.removeAll(true);
    this.callTimer = null;
    if (!call) return;
    const cx = CALL_X + CALL_W / 2;
    const name = (id: string) => state.players.find((p) => p.id === id);
    const label = (id: string) => call.options.find((o) => o.id === id)?.label ?? id;
    const waiting = call.eligible.filter((id) => !call.decided.includes(id));
    const lines = call.called.length + waiting.length;
    const h = 200 + Math.max(1, call.called.length) * 90 + (waiting.length ? 110 : 0);
    const top = CENTER_Y - h / 2;
    this.callLayer.add(panel(this, CALL_X, top, CALL_W, h));
    this.callLayer.add(text(this, cx, top + 50, 'CALL THIS ROUND?', 34, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(3));
    let y = top + 130;
    if (!call.called.length) {
      this.callLayer.add(text(this, cx, y, lines ? 'No calls yet' : 'No calls', 32, COLORS.muted));
      y += 90;
    }
    for (const c of call.called) {
      const who = name(c.playerId);
      this.callLayer.add(text(this, cx, y - 18, who?.name ?? '?', 36, who?.color ?? COLORS.text, { fontStyle: '700' }));
      this.callLayer.add(text(this, cx, y + 22, `called a ${label(c.option)}!`, 30, COLORS.text));
      y += 90;
    }
    if (waiting.length) {
      const names = waiting.map((id) => name(id)?.name ?? '?').join(', ');
      this.callLayer.add(text(this, cx, y + 10, `Deciding: ${names}`, 26, COLORS.muted, { wordWrap: { width: CALL_W - 40 }, align: 'center' }));
      y += 110;
    }
    this.callTimer = text(this, cx, top + h - 40, '', 28, COLORS.muted);
    this.callLayer.add(this.callTimer);
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
