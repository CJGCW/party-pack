import type { BlastPlayerState } from '../../../shared/games/blastGrid';
import type { Controller } from '../main';
import { createStickPad } from '../stickPad';

/** Walk the yard on the TV and drop bombs (see ../stickPad). */
export function createBlastGrid(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createStickPad<BlastPlayerState>(root, send, {
    scoring: 'survival',
    hint: 'Drag to walk. Drop a bomb, then get out of its cross! Smash crates for power-ups.',
    action: { label: 'BOMB', input: { type: 'bomb' } },
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      return `${s.bombs} bomb${s.bombs === 1 ? '' : 's'} · blast ${s.range} · speed ${s.speedups + 1} · ${s.crates} crate${s.crates === 1 ? '' : 's'}`;
    },
    ended: (v) => (v.endedAtMs !== null ? `Blown up at ${Math.floor(v.endedAtMs / 1000)}s` : ''),
  });
}
