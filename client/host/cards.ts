import Phaser from 'phaser';
import { SUIT_SYMBOLS, isFaceCard, isJoker, isRed, type Card } from '../../shared/cards';
import { COLORS, text } from './theme';

/** A card's width on the TV by default; height is 1.4 times the width. */
export const CARD_W = 140;
const FACE = 0xfdfcf7;
const EDGE = 0xcfcade;
const RED = '#d6264a';
const BLACK = '#1d1a33';

/** What a card container shows, so it can be redrawn or flipped. */
const FACE_KEY = 'card';

/** One playing card on the TV, centred on (x, y); `null` draws the back. */
export function addCard(scene: Phaser.Scene, x: number, y: number, card: Card | null, width = CARD_W) {
  const container = scene.add.container(x, y);
  container.setData('width', width);
  drawCard(scene, container, card);
  return container;
}

/** Redraws a card container as `card` (or its back, for `null`). */
export function drawCard(scene: Phaser.Scene, container: Phaser.GameObjects.Container, card: Card | null) {
  const w: number = container.getData('width') ?? CARD_W;
  const hgt = w * 1.4;
  const r = w * 0.1;
  container.removeAll(true);
  container.setData(FACE_KEY, card);
  container.setSize(w, hgt);

  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(-w / 2 + 3, -hgt / 2 + 5, w, hgt, r);
  container.add(g);

  if (!card) {
    // The back: a purple panel inside a white border, with a grid of small diamonds.
    g.fillStyle(FACE, 1);
    g.fillRoundedRect(-w / 2, -hgt / 2, w, hgt, r);
    const inset = w * 0.07;
    g.fillStyle(COLORS.panelLight, 1);
    g.fillRoundedRect(-w / 2 + inset, -hgt / 2 + inset, w - inset * 2, hgt - inset * 2, r * 0.6);
    g.fillStyle(0xffffff, 0.16);
    const step = w * 0.16;
    const d = step * 0.32;
    const cols = Math.floor((w - inset * 2) / step);
    const rows = Math.floor((hgt - inset * 2) / step);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = (col - (cols - 1) / 2) * step;
        const cy = (row - (rows - 1) / 2) * step;
        g.fillPoints([new Phaser.Math.Vector2(cx, cy - d), new Phaser.Math.Vector2(cx + d, cy), new Phaser.Math.Vector2(cx, cy + d), new Phaser.Math.Vector2(cx - d, cy)], true);
      }
    }
    return container;
  }

  g.fillStyle(FACE, 1);
  g.fillRoundedRect(-w / 2, -hgt / 2, w, hgt, r);
  g.lineStyle(2, EDGE, 1);
  g.strokeRoundedRect(-w / 2, -hgt / 2, w, hgt, r);
  const color = isRed(card) ? RED : BLACK;
  const corner = w * 0.2;

  if (isJoker(card)) {
    container.add([
      text(scene, -w / 2 + w * 0.16, -hgt / 2 + w * 0.17, '★', corner, color),
      text(scene, 0, 0, 'J\nO\nK\nE\nR', w * 0.16, color, { fontStyle: '700', align: 'center', lineSpacing: -w * 0.03 }),
      text(scene, w / 2 - w * 0.16, hgt / 2 - w * 0.17, '★', corner, color).setAngle(180),
    ]);
    return container;
  }

  const suit = SUIT_SYMBOLS[card.suit];
  const cornerText = `${card.rank}\n${suit}`;
  const style = { fontStyle: '700', align: 'center', lineSpacing: -w * 0.04 };
  container.add([
    text(scene, -w / 2 + w * 0.17, -hgt / 2 + w * 0.25, cornerText, corner, color, style),
    isFaceCard(card)
      ? text(scene, 0, 0, `${card.rank}\n${suit}`, w * 0.36, color, { ...style, lineSpacing: -w * 0.1 })
      : text(scene, 0, 0, suit, w * 0.55, color),
    text(scene, w / 2 - w * 0.17, hgt / 2 - w * 0.25, cornerText, corner, color, style).setAngle(180),
  ]);
  return container;
}

/** Turns a card over to show `card` (or its back), squashing it flat and back out. */
export function flipCard(scene: Phaser.Scene, container: Phaser.GameObjects.Container, card: Card | null, duration = 320) {
  return new Promise<void>((resolve) => {
    const scaleX = container.scaleX || 1;
    scene.tweens.add({
      targets: container,
      scaleX: 0,
      duration: duration / 2,
      ease: 'Sine.easeIn',
      onComplete: () => {
        drawCard(scene, container, card);
        scene.tweens.add({ targets: container, scaleX, duration: duration / 2, ease: 'Sine.easeOut', onComplete: () => resolve() });
      },
    });
  });
}

/** Lays cards out in a row centred on (x, y), overlapping if they'd be wider than `maxWidth`. */
export function addCardRow(scene: Phaser.Scene, x: number, y: number, cards: (Card | null)[], { width = CARD_W, gap = 16, maxWidth = 1600 } = {}) {
  const step = Math.min(width + gap, cards.length > 1 ? (maxWidth - width) / (cards.length - 1) : width);
  const start = x - ((cards.length - 1) * step) / 2;
  return cards.map((card, i) => addCard(scene, start + i * step, y, card, width));
}
