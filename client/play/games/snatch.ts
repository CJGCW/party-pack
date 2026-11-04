import type { SnatchInput, SnatchView } from '../../../shared/games/snatch';
import { serverNow } from '../../clock';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/**
 * One big pad: it shows the cover, and lifts it at the moment the server set (on its clock, so
 * everyone sees it together). Tap it when it's the treasure.
 */
export function createSnatch(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: SnatchView | null = null;
  let frame = 0;
  let shown = '';

  const headerEl = h('span');
  const scoreEl = h('span');
  const faceEl = h('div', { class: 'sn-face' });
  const padLabel = h('div', { class: 'cf-pad-label' });
  const pad = h('div', { class: 'cf-pad sn-pad' }, faceEl, padLabel);
  const msgEl = h('div', { class: 'po-points' });
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, h('span'), scoreEl), msgEl, pad, statsEl));

  const playerId = () => view?.you ?? null;
  const me = () => view?.players.find((p) => p.id === playerId());

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (view?.phase !== 'grab' || me()?.locked) return;
    navigator.vibrate?.(20);
    send({ type: 'tap', at: Math.round(serverNow()) } satisfies SnatchInput);
  });

  /** What the pad shows now: the cover, or what's under it while it's up. */
  function face(): 'cover' | 'treasure' | 'trap' | 'locked' | 'idle' {
    if (!view || view.phase !== 'grab') return 'idle';
    if (me()?.locked) return 'locked';
    const now = serverNow();
    return now >= view.revealAt && now < view.hideAt ? view.kind : 'cover';
  }

  function loop() {
    const f = face();
    if (f !== shown) {
      shown = f;
      pad.className = `cf-pad sn-pad sn-${f}`;
      faceEl.textContent = { cover: '?', treasure: '★', trap: '✖', locked: '🔒', idle: '' }[f];
      padLabel.textContent = { cover: 'WAIT FOR IT…', treasure: 'GRAB IT!', trap: "DON'T!", locked: 'LOCKED OUT', idle: '' }[f];
    }
    frame = requestAnimationFrame(loop);
  }

  function render() {
    if (!view) return;
    const v = view;
    const mine = me();
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Grab ${v.grab}`;
    scoreEl.textContent = `${mine?.grabs ?? 0} grabbed`;
    const winner = v.players.find((p) => p.id === v.winner);
    pad.hidden = v.phase !== 'grab' && v.phase !== 'won';
    if (v.phase === 'won') msgEl.textContent = winner ? `${winner.id === playerId() ? 'You' : winner.name} grabbed it in ${v.reaction}ms!` : 'Nobody grabbed it!';
    else if (v.phase === 'result') {
      const rank = 1 + v.players.filter((p) => p.grabs > (mine?.grabs ?? 0)).length;
      msgEl.textContent = `${ordinal(rank)} place · +${(mine?.points ?? 0).toLocaleString()} points`;
    } else if (v.phase === 'gameEnd') msgEl.textContent = `You got +${(mine?.gamePoints ?? 0).toLocaleString()} this round. Look at the TV!`;
    else msgEl.textContent = 'Tap the moment the treasure shows. Not before, and not on a trap!';
    statsEl.textContent = v.players.map((p) => `${p.name} ${p.grabs}`).join(' · ');
  }

  loop();
  return {
    update(raw) {
      view = raw as SnatchView;
      shown = '';
      render();
    },
    destroy() {
      cancelAnimationFrame(frame);
      root.replaceChildren();
    },
  };
}
