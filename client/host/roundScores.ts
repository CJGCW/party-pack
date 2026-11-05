import Phaser from 'phaser';
import { COLORS, HEIGHT, WIDTH, burstConfetti, hex, panel, text } from './theme';

/** Gold, silver and bronze, then plain. */
const RANKS = [0xffd166, 0xc9cde0, 0xd98e4a];

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
export function showRoundScores(
  scene: Phaser.Scene,
  overlay: Phaser.GameObjects.Container,
  scores: RoundScore[],
  title = 'ROUND SCORES',
  titleColor: string = COLORS.accent,
) {
  overlay.add(scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0720, 0.88).setOrigin(0));
  const heading = text(scene, WIDTH / 2, 170, title, 84, titleColor, { fontStyle: '700' }).setScale(0.7).setAlpha(0);
  overlay.add(heading);
  scene.tweens.add({ targets: heading, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });

  const sorted = [...scores].sort((a, b) => b.points - a.points);
  const best = Math.max(1, sorted[0]?.points ?? 1);
  const rowH = 78;
  const top = 290;
  overlay.add(panel(scene, WIDTH / 2 - 480, top - 50, 960, sorted.length * rowH + 40));

  sorted.forEach((s, i) => {
    const y = top + i * rowH;
    const bar = scene.add.graphics().setAlpha(0);
    const barLeft = WIDTH / 2 - 400;
    const barW = 820;
    const showBar = (share: number) => {
      const w = Math.max(barW * share, 56);
      bar.clear().fillStyle(hex(s.color), 0.28).fillRoundedRect(barLeft, y - 30, w, 60, 18);
    };
    showBar(0);
    const placed = s.points > 0 && (i === 0 || sorted[i - 1].points > s.points) ? i : sorted.findIndex((o) => o.points === s.points);
    const badge = scene.add.circle(WIDTH / 2 - 438, y, 25, RANKS[placed] ?? 0x4a4570).setAlpha(0);
    const rank = text(scene, WIDTH / 2 - 438, y, String(placed + 1), 30, placed < 3 ? '#140f2e' : COLORS.text, { fontStyle: '700' }).setAlpha(0);
    overlay.add([bar, badge, rank]);
    const name = text(scene, WIDTH / 2 - 380, y, s.name, 48, s.color, { fontStyle: '700' }).setOrigin(0, 0.5);
    const pts = text(scene, WIDTH / 2 + 380, y, '+0', 48, s.points > 0 ? COLORS.text : COLORS.muted, {
      fontStyle: '700',
    }).setOrigin(1, 0.5);
    for (const t of [name, pts]) t.setAlpha(0);
    overlay.add([name, pts]);

    const delay = 150 + i * 100;
    scene.tweens.add({ targets: [name, pts, bar, badge, rank], alpha: 1, duration: 250, delay });
    name.x -= 36;
    scene.tweens.add({ targets: name, x: name.x + 36, duration: 320, delay, ease: 'Cubic.easeOut' });
    scene.tweens.addCounter({
      from: 0,
      to: s.points,
      duration: 900,
      delay: delay + 200,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => {
        const value = t.getValue() ?? 0;
        pts.setText(`+${Math.round(value).toLocaleString()}`);
        showBar(value / best);
      },
    });
  });

  if (sorted[0]?.points > 0) {
    scene.time.delayedCall(1000, () => {
      burstConfetti(scene, WIDTH * 0.25, HEIGHT * 0.45, 60);
      burstConfetti(scene, WIDTH * 0.75, HEIGHT * 0.45, 60);
    });
  }
}
