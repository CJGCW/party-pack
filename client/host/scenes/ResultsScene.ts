import Phaser from 'phaser';
import { net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, panel, text } from '../theme';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/** Final standings after the last round of a session. */
export class ResultsScene extends Phaser.Scene {
  static readonly KEY = 'Results';

  private countdown!: Phaser.GameObjects.Text;
  private endsAt = 0;

  constructor() {
    super(ResultsScene.KEY);
  }

  create() {
    addBackdrop(this);
    const state = net.room;
    if (!state) return;
    this.endsAt = performance.now() + state.resultsMsLeft;

    text(this, WIDTH / 2, 90, 'FINAL RESULTS', 64, COLORS.accent, { fontStyle: '700' });

    const standings = [...state.players].sort((a, b) => b.score - a.score);
    const winner = standings[0];
    if (winner) {
      const crown = text(this, WIDTH / 2, 230, `${winner.name} WINS!`, 120, winner.color, {
        fontStyle: '700',
        stroke: '#140f2e',
        strokeThickness: 12,
      }).setScale(0);
      this.tweens.add({ targets: crown, scale: 1, duration: 700, delay: 300, ease: 'Elastic.easeOut' });
      this.time.delayedCall(400, () => {
        burstConfetti(this, WIDTH * 0.2, HEIGHT * 0.45, 90);
        burstConfetti(this, WIDTH * 0.8, HEIGHT * 0.45, 90);
      });
      this.time.delayedCall(1800, () => burstConfetti(this, WIDTH / 2, HEIGHT * 0.35, 90));
    }

    panel(this, WIDTH / 2 - 460, 350, 920, 60 + standings.length * 66);
    standings.forEach((p, i) => {
      const y = 400 + i * 66;
      const row = [
        text(this, WIDTH / 2 - 380, y, ORDINAL[i], 40, COLORS.muted),
        text(this, WIDTH / 2 - 60, y, p.name, 46, p.color, { fontStyle: '700' }),
        text(this, WIDTH / 2 + 330, y, p.score.toLocaleString(), 46, COLORS.text),
      ];
      for (const t of row) t.setAlpha(0);
      // Reveal from last place up to the winner.
      this.tweens.add({ targets: row, alpha: 1, duration: 300, delay: 800 + (standings.length - i) * 300 });
    });

    this.countdown = text(this, WIDTH / 2, HEIGHT - 50, '', 30, COLORS.muted);
  }

  update() {
    const secs = Math.max(0, Math.ceil((this.endsAt - performance.now()) / 1000));
    this.countdown?.setText(`Back to the lobby in ${secs}`);
  }
}
