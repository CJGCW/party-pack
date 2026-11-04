import { DODGE_LEVELS, type DodgeState } from '../../../shared/games/dodgeBox';
import type { Controller } from '../main';
import { createStickPad } from '../stickPad';

/** Steer your square on the TV with the stick (see ../stickPad): your finger never covers it. */
export function createDodgeBox(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createStickPad<DodgeState>(root, send, {
    scoring: 'race',
    hint: 'Drag to steer your square on the TV. Get every coin, then reach the green goal. Mind the dots!',
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      return `${s.coins.length} of ${DODGE_LEVELS[s.level].coins.length} coins · ${s.deaths} hit${s.deaths === 1 ? '' : 's'}`;
    },
    ended: () => 'You made it!',
  });
}
