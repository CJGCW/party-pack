import type { GlideState } from '../../../shared/games/glideDrop';
import type { Controller } from '../main';
import { createSteerPad } from '../steerPad';

/** Pitch your glider by turning the phone (see ../steerPad); FOLD folds or opens its wings. */
export function createGlideDrop(root: HTMLElement, send: (input: unknown) => void): Controller {
  return createSteerPad<GlideState>(root, send, {
    scoring: 'best',
    hint: 'Turn your phone anticlockwise to tip the nose up (slower, flatter), clockwise to dive. FOLD drops you; tap again to open. Land on the target!',
    dragHint: 'Drag on the dial: left tips the nose up, right dives. FOLD drops you; tap again to open. Land on the target!',
    actions: [{ label: 'FOLD', input: { type: 'fold' } }],
    stats: (v) => {
      const s = v.state;
      if (!s) return '';
      const flights = s.scores.map((p, i) => `F${i + 1}: ${p}`).join(' · ');
      return s.status === 'flying' ? `Flight ${s.flight + 1} · ${s.open ? 'gliding' : 'falling!'}${flights ? ` · ${flights}` : ''}` : flights;
    },
    score: (v) => `${v.boardScore} points`,
    ended: (v) => `${v.boardScore} points from your flights`,
  });
}
