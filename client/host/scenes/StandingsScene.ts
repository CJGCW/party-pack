import Phaser from 'phaser';
import type { PlayerInfo } from '../../../shared/protocol';
import { net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, hex, text } from '../theme';

const ROW_W = 1100;
const ROW_H = 92;
const ROW_GAP = 14;
const TOP = 300;
/** Pause before the totals start counting up, and how long the count takes. */
const COUNT_DELAY_MS = 600;
const COUNT_MS = 1800;

interface Row {
  player: PlayerInfo;
  container: Phaser.GameObjects.Container;
  rank: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
  from: number;
  to: number;
  shown: number;
}

/**
 * Running totals between rounds. Each total counts up from where it was before
 * the round, and rows slide past each other whenever one total overtakes another.
 */
export class StandingsScene extends Phaser.Scene {
  static readonly KEY = 'Standings';

  private rows: Row[] = [];
  /** Player ids in the order currently shown, top first. */
  private order: string[] = [];
  private countdown!: Phaser.GameObjects.Text;
  private endsAt = 0;
  private nextLabel = '';

  constructor() {
    super(StandingsScene.KEY);
  }

  create() {
    this.rows = [];
    this.order = [];
    addBackdrop(this);

    const state = net.room;
    if (!state?.standings) return;
    const previous = state.standings.previousScores;
    this.endsAt = performance.now() + state.standings.msLeft;
    const session = state.session;
    const isLast = !session || session.round >= session.totalRounds;
    this.nextLabel = isLast ? 'Final results' : 'Next spin';

    text(this, WIDTH / 2, 110, 'STANDINGS', 84, COLORS.accent, { fontStyle: '700' });
    if (session) text(this, WIDTH / 2, 200, `After round ${session.round} of ${session.totalRounds}`, 40, COLORS.muted);

    // Start in the order from before this round; ties keep join order.
    const players = [...state.players].sort((a, b) => (previous[b.id] ?? 0) - (previous[a.id] ?? 0));
    players.forEach((p, i) => this.rows.push(this.buildRow(p, previous[p.id] ?? 0, i)));
    this.order = players.map((p) => p.id);

    this.time.delayedCall(COUNT_DELAY_MS, () => this.countUp());
    this.countdown = text(this, WIDTH / 2, HEIGHT - 50, '', 32, COLORS.muted);
  }

  update() {
    if (!this.countdown) return;
    const secs = Math.max(0, Math.ceil((this.endsAt - performance.now()) / 1000));
    this.countdown.setText(`${this.nextLabel} in ${secs}`);
  }

  private slotY(index: number) {
    return TOP + index * (ROW_H + ROW_GAP) + ROW_H / 2;
  }

  private buildRow(player: PlayerInfo, from: number, index: number): Row {
    const container = this.add.container(WIDTH / 2, this.slotY(index));
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.92);
    bg.fillRoundedRect(-ROW_W / 2, -ROW_H / 2, ROW_W, ROW_H, 20);
    bg.fillStyle(hex(player.color), 1);
    bg.fillRoundedRect(-ROW_W / 2, -ROW_H / 2, 22, ROW_H, { tl: 20, bl: 20, tr: 0, br: 0 });
    const rank = text(this, -ROW_W / 2 + 80, 0, `${index + 1}`, 44, COLORS.muted, { fontStyle: '700' });
    const name = text(this, -ROW_W / 2 + 150, 0, player.name, 48, player.color, { fontStyle: '700' }).setOrigin(0, 0.5);
    const score = text(this, ROW_W / 2 - 40, 0, from.toLocaleString(), 52, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    container.add([bg, rank, name, score]);

    // Slide in from the side, one after another.
    container.setX(WIDTH / 2 - 120).setAlpha(0);
    this.tweens.add({ targets: container, x: WIDTH / 2, alpha: 1, duration: 300, delay: 50 + index * 60, ease: 'Cubic.easeOut' });
    return { player, container, rank, score, from, to: player.score, shown: from };
  }

  private countUp() {
    // "+N this round" badges appear as the counting starts.
    for (const row of this.rows) {
      const gained = row.to - row.from;
      if (gained <= 0) continue;
      const badge = text(this, ROW_W / 2 - 330, 0, `+${gained.toLocaleString()}`, 36, COLORS.accent, { fontStyle: '700' });
      badge.setOrigin(1, 0.5).setAlpha(0).setScale(0.6);
      row.container.add(badge);
      this.tweens.add({ targets: badge, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    }

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: COUNT_MS,
      ease: 'Cubic.easeInOut',
      onUpdate: (t) => {
        const progress = t.getValue() ?? 0;
        for (const row of this.rows) {
          row.shown = Math.round(row.from + (row.to - row.from) * progress);
          row.score.setText(row.shown.toLocaleString());
        }
        this.reorder();
      },
      onComplete: () => this.celebrateLeader(),
    });
  }

  /** Moves rows whose position changed, so overtakes happen as the totals pass each other. */
  private reorder() {
    const previousIndex = new Map(this.order.map((id, i) => [id, i]));
    const sorted = [...this.rows].sort(
      (a, b) => b.shown - a.shown || previousIndex.get(a.player.id)! - previousIndex.get(b.player.id)!,
    );
    const next = sorted.map((r) => r.player.id);
    if (next.join() === this.order.join()) return;

    sorted.forEach((row, i) => {
      if (previousIndex.get(row.player.id) === i) return;
      this.tweens.killTweensOf(row.container);
      row.container.setX(WIDTH / 2).setAlpha(1);
      // The row moving up gets a little pop so the overtake is easy to spot.
      const movingUp = i < previousIndex.get(row.player.id)!;
      this.tweens.add({ targets: row.container, y: this.slotY(i), duration: 380, ease: 'Cubic.easeOut' });
      if (movingUp) this.tweens.add({ targets: row.container, scale: 1.05, duration: 190, yoyo: true });
      row.rank.setText(`${i + 1}`);
    });
    this.order = next;
  }

  private celebrateLeader() {
    const leader = this.rows.find((r) => r.player.id === this.order[0]);
    if (!leader) return;
    leader.rank.setText('★').setColor(COLORS.accent);
    this.tweens.add({ targets: leader.container, scale: 1.06, duration: 260, yoyo: true, repeat: 1 });
  }
}
