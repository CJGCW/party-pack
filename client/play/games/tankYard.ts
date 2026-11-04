import { HITS, type TankPlayerState } from '../../../shared/games/tankYard';
import type { Controller } from '../main';
import { createStickPad } from '../stickPad';

/** Drive your tank on the TV and fire (see ../stickPad). */
export function createTankYard(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createStickPad<TankPlayerState>(root, send, {
    scoring: 'survival',
    hint: 'Drag the way you want to go: your tank turns and drives. FIRE shoots straight ahead; shells bounce once.',
    action: { label: 'FIRE', input: { type: 'fire' } },
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      return `${'♥'.repeat(s.hitsLeft)}${'♡'.repeat(Math.max(0, HITS - s.hitsLeft))} · ${s.shellsReady} shell${s.shellsReady === 1 ? '' : 's'} ready`;
    },
    ended: (v) => (v.endedAtMs !== null ? `Knocked out at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
