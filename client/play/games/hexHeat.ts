import type { HeatStage } from '../../../shared/games/hexHeat';
import type { Controller } from '../main';
import { createTiltPad } from '../tiltPad';

const NAMES = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

/** Tip the phone to roll onto the colour called (see ../tiltPad). */
export function createHexHeat(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createTiltPad<{ called: number; stage: HeatStage }>(root, send, {
    scoring: 'survival',
    hint: 'Hold your phone flat and tip it to roll. Get onto the colour called before the rest of the floor drops!',
    dragHint: 'Drag on the level to roll. Get onto the colour called before the rest of the floor drops!',
    stats: (v) => (v.state && v.state.stage !== 'back' ? `Get on ${NAMES[v.state.called]}! · ${v.going} of ${v.playing} still in` : `${v.going} of ${v.playing} still in`),
    ended: (v) => (v.endedAtMs !== null ? `Dropped at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
