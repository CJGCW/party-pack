import type { SnowPlayerState } from '../../../shared/games/snowChase';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Ski the slope on the TV (see ../steerPad). */
export function createSnowChase(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<SnowPlayerState>(root, send, {
    scoring: 'survival',
    hint: 'Turn your phone like a steering wheel to ski left and right; straight down is fastest. Dodge trees, take gates. (Lying flat? Tilt it.)',
    dragHint: 'Drag left and right on the dial to steer; straight down is fastest. Dodge trees, take gates.',
    stats: (v) => {
      const gates = `${v.state?.gates ?? 0} gates`;
      const behind = v.state?.beastBehind;
      return behind === null || behind === undefined ? gates : `${gates} · the beast is ${behind} behind!`;
    },
    ended: (v) => (v.endedAtMs !== null ? `Caught at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
