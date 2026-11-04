import { COLORS, type BubblePlayerState } from '../../../shared/games/bubbleBrawl';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Aim at your cluster on the TV by turning the phone (see ../steerPad); fire and swap with the buttons. */
export function createBubbleBrawl(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<BubblePlayerState>(root, send, {
    scoring: 'survival',
    // A quarter turn either way aims right out to the side, as on Spiral Shot.
    wheelGain: 2,
    hint: 'Turn your phone like a steering wheel to aim; FIRE shoots, SWAP swaps with the next bubble. Three of a colour pop. (Lying flat? Tilt it.)',
    dragHint: 'Drag left and right on the dial to aim; FIRE shoots, SWAP swaps with the next bubble. Three of a colour pop.',
    actions: [
      { label: 'FIRE', input: { type: 'fire' } },
      { label: 'SWAP', input: { type: 'swap' } },
    ],
    balls: (v) => (v.state ? { current: COLORS[v.state.current], next: COLORS[v.state.next] } : null),
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      const incoming = s.incoming ? ` · ${s.incoming} coming your way!` : '';
      return `${s.popped} popped · ${s.sent} sent${incoming}`;
    },
    ended: (v) => (v.endedAtMs !== null ? `Over the line at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
