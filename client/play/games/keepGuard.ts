import type { GuardPlayerState } from '../../../shared/games/keepGuard';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Swing your keep's shield on the TV (see ../steerPad). */
export function createKeepGuard(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<GuardPlayerState>(root, send, {
    scoring: 'survival',
    hint: 'Turn your phone like a steering wheel to swing your shield round your keep. Hold CATCH to catch a ball, let go to fire it!',
    dragHint: 'Drag left and right on the dial to swing your shield round your keep. Hold CATCH to catch a ball, let go to fire it!',
    actions: [{ label: 'CATCH', input: { type: 'catch', held: true }, release: { type: 'catch', held: false } }],
    stats: (v) => {
      const balls = v.state?.balls ?? 0;
      return v.state?.holding ? 'Got it! Aim, and let go to fire.' : `${v.state?.bricks ?? 0} bricks left · ${balls} ball${balls === 1 ? '' : 's'} in play`;
    },
    ended: (v) => (v.endedAtMs !== null ? `Your keep fell at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
