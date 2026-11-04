import type { MoonPlayerState } from '../../../shared/games/moonDrop';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Tilt your lander by turning the phone (see ../steerPad); hold THRUST to slow down. */
export function createMoonDrop(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<MoonPlayerState>(root, send, {
    scoring: 'best',
    hint: 'Turn your phone like a steering wheel to tilt your lander; hold THRUST to push against the way it points. Land on a pad, slowly and upright!',
    dragHint: 'Drag left and right on the dial to tilt your lander; hold THRUST to push. Land on a pad, slowly and upright!',
    actions: [{ label: 'THRUST', input: { type: 'thrust', on: true }, release: { type: 'thrust', on: false } }],
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      return s.status === 'flying' ? `Fuel ${s.fuel}% · speed ${s.speed}` : s.status === 'landed' ? `Landed! ${s.score} points` : 'Crashed!';
    },
    score: (v) => (v.state?.status === 'crashed' ? 'Crashed' : `${v.boardScore} points`),
    ended: (v) => (v.state?.status === 'landed' ? `Landed! ${v.state.score} points` : 'Crashed!'),
  });
}
