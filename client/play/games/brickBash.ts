import type { BashPlayerState } from '../../../shared/games/brickBash';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Slide your paddle on the TV by turning the phone (see ../steerPad). */
export function createBrickBash(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<BashPlayerState>(root, send, {
    scoring: 'best',
    hint: 'Turn your phone like a steering wheel to slide your paddle. Keep the ball up and smash the bricks! (Lying flat? Tilt it.)',
    dragHint: 'Drag left and right on the dial to slide your paddle. Keep the ball up and smash the bricks!',
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      const sent = s.garbage ? ` · ${s.sent} row${s.sent === 1 ? '' : 's'} sent` : '';
      return `${s.smashed} brick${s.smashed === 1 ? '' : 's'} · ${s.lost} ball${s.lost === 1 ? '' : 's'} lost${sent}`;
    },
    score: (v) => `${v.boardScore} bricks`,
    ended: () => 'Your run is over',
  });
}
