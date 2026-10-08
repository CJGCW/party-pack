import Phaser from 'phaser';
import { COLORS, HEIGHT, WIDTH, burstConfetti, panel, text } from './theme';

export interface RoundScore {
  name: string;
  color: string;
  /** Points earned in the game that just ended. */
  points: number;
}

/**
 * The "round scores" screen every game shows after its last puzzle: what each
 * player earned this round, counting up, best first. Running totals come next,
 * on the standings screen.
 */
export function showRoundScores(scene: Phaser.Scene, overlay: Phaser.GameObjects.Container, scores: RoundScore[]) {
  overlay.add(scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0720, 0.88).setOrigin(0));
  overlay.add(text(scene, WIDTH / 2, 170, 'ROUND SCORES', 80, COLORS.accent, { fontStyle: '700' }));

  const sorted = [...scores].sort((a, b) => b.points - a.points);
  const rowH = 78;
  const top = 290;
  overlay.add(panel(scene, WIDTH / 2 - 480, top - 50, 960, sorted.length * rowH + 40));

  sorted.forEach((s, i) => {
    const y = top + i * rowH;
    const name = text(scene, WIDTH / 2 - 380, y, s.name, 48, s.color, { fontStyle: '700' }).setOrigin(0, 0.5);
    const pts = text(scene, WIDTH / 2 + 380, y, '+0', 48, s.points > 0 ? COLORS.text : COLORS.muted, {
      fontStyle: '700',
    }).setOrigin(1, 0.5);
    for (const t of [name, pts]) t.setAlpha(0);
    overlay.add([name, pts]);

    const delay = 300 + i * 180;
    scene.tweens.add({ targets: [name, pts], alpha: 1, duration: 250, delay });
    scene.tweens.addCounter({
      from: 0,
      to: s.points,
      duration: 1200,
      delay: delay + 200,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => pts.setText(`+${Math.round(t.getValue() ?? 0).toLocaleString()}`),
    });
  });

  if (sorted[0]?.points > 0) {
    scene.time.delayedCall(1700, () => {
      burstConfetti(scene, WIDTH * 0.25, HEIGHT * 0.45, 60);
      burstConfetti(scene, WIDTH * 0.75, HEIGHT * 0.45, 60);
    });
  }
}
