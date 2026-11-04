import { GIZMO_LEVELS, type GizmoInput, type GizmoState, type PartKind } from '../../../shared/games/gizmoGoal';
import { h } from '../dom';
import type { Controller } from '../main';
import { createPuzzlePad } from '../physPuzzlePad';

const PART_NAMES: Record<PartKind, string> = { plank: 'Plank', bouncer: 'Bumper', fan: 'Fan' };

/**
 * Your machine: pick a part from the tray and tap the board to put it there; tap a part you've
 * placed to pick it, then Turn or Remove it. Run lets the ball go; Retry puts it back.
 */
export function createGizmoGoal(root: HTMLElement, send: (input: unknown) => void): Controller {
  let chosen: PartKind | null = null;
  let selected: number | null = null;

  const pad = createPuzzlePad<GizmoState>(root, send, {
    levels: GIZMO_LEVELS,
    buttons: [
      { label: 'Run', input: { type: 'run' } satisfies GizmoInput, show: (s) => !s.released },
      { label: 'Retry', input: { type: 'retry' } satisfies GizmoInput, show: (s) => s.released },
    ],
    message: (s) => s.refused || `${GIZMO_LEVELS[s.level].name} · ${selected !== null ? 'Turn or remove the part, or tap elsewhere' : chosen ? `Tap to place a ${PART_NAMES[chosen].toLowerCase()}` : 'Pick a part'}`,
    overlay: (ctx, s) => {
      // The picked part, outlined.
      const p = s.pieces.find((o) => o.id === selected);
      if (!p) return;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(p.x - 46, p.y - 46, 92, 92);
      ctx.setLineDash([]);
    },
    onUpdate: (s) => {
      if (!s.pieces.some((p) => p.id === selected) || s.released) selected = null;
      renderTray(s);
    },
  });

  const trayEl = h('div', { class: 'pp-tray' });
  const turnBtn = h('button', { type: 'button', class: 'secondary' }, 'Turn') as HTMLButtonElement;
  const removeBtn = h('button', { type: 'button', class: 'secondary' }, 'Remove') as HTMLButtonElement;
  const editEl = h('div', { class: 'pp-tray' }, turnBtn, removeBtn);
  root.querySelector('.pp-buttons')?.before(trayEl, editEl);

  function renderTray(s: GizmoState) {
    const playing = pad.canAct() || !s.released;
    trayEl.replaceChildren(
      ...(Object.keys(s.tray) as PartKind[]).map((kind) => {
        const left = s.tray[kind] ?? 0;
        const btn = h('button', { type: 'button', class: chosen === kind ? 'on' : '' }, `${PART_NAMES[kind]} ×${left}`) as HTMLButtonElement;
        btn.disabled = left <= 0 || s.released;
        btn.addEventListener('click', () => {
          chosen = chosen === kind ? null : kind;
          selected = null;
          renderTray(s);
          pad.setMessage('');
        });
        return btn;
      }),
    );
    if (chosen && (s.tray[chosen] ?? 0) <= 0) chosen = null;
    trayEl.hidden = !playing;
    editEl.hidden = selected === null || s.released;
    const part = s.pieces.find((p) => p.id === selected);
    turnBtn.hidden = part?.kind !== 'plank';
    pad.redraw();
  }

  turnBtn.addEventListener('click', () => selected !== null && pad.canAct() && send({ type: 'turn', id: selected } satisfies GizmoInput));
  removeBtn.addEventListener('click', () => {
    if (selected === null || !pad.canAct()) return;
    send({ type: 'remove', id: selected } satisfies GizmoInput);
    selected = null;
  });

  pad.canvas.addEventListener('pointerdown', (e) => {
    const s = pad.state();
    if (!s || !pad.canAct() || s.released) return;
    e.preventDefault();
    const at = pad.boardPoint(e);
    // A placed part under the finger: pick it.
    const hit = s.pieces.find((p) => p.id > 1 && Math.hypot(p.x - at.x, p.y - at.y) < 46);
    if (hit) {
      selected = selected === hit.id ? null : hit.id;
      renderTray(s);
      pad.setMessage('');
      return;
    }
    selected = null;
    if (!chosen) {
      renderTray(s);
      pad.setMessage('Pick a part from the tray first.');
      return;
    }
    navigator.vibrate?.(10);
    send({ type: 'place', part: chosen, x: Math.round(at.x), y: Math.round(at.y) } satisfies GizmoInput);
  });
  return pad.controller;
}
