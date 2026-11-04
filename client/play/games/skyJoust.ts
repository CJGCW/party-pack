import { LIVES, type JoustPlayerState } from '../../../shared/games/skyJoust';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Fly round the cave on the TV: steer with the phone (see ../steerPad), flap with the big button. */
export function createSkyJoust(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<JoustPlayerState>(root, send, {
    scoring: 'survival',
    hint: 'Turn your phone like a steering wheel to fly left and right; tap FLAP to climb. Hit rivals from above.',
    dragHint: 'Drag left and right on the dial to fly left and right; tap FLAP to climb. Hit rivals from above.',
    actions: [{ label: 'FLAP', input: { type: 'flap' } }],
    stats: (v) => {
      const lives = v.state?.lives ?? 0;
      const knocks = v.state?.knocks ?? 0;
      return `${'♥'.repeat(lives)}${'♡'.repeat(Math.max(0, LIVES - lives))} · ${knocks} knock${knocks === 1 ? '' : 's'}`;
    },
    ended: (v) => (v.endedAtMs !== null ? `Out of lives at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
