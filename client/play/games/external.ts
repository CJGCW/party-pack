import type { ExternalInput, ExternalPlayerView } from '../../../shared/games/external';
import { h } from '../dom';
import type { Controller } from '../main';

/**
 * A game played away from the app: what to play and for how long. The VIP taps We're finished,
 * then taps who won (any number, or nobody) and Done.
 */
export function createExternal(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: ExternalPlayerView | null = null;
  let startedAt = 0;
  let picking = false;
  let sent = false;
  const winners = new Set<string>();

  const nameEl = h('div', { class: 'ext-name' });
  const clockEl = h('div', { class: 'ext-clock' });
  const noteEl = h('p', { class: 'muted' });
  const finishBtn = h('button', { class: 'ext-finish', type: 'button' }, "We're finished") as HTMLButtonElement;
  const playingEl = h('div', { class: 'center ext' }, h('p', {}, 'Time to play'), nameEl, clockEl, noteEl, finishBtn);

  const pickTitle = h('h2', {});
  const pickNote = h('p', { class: 'muted' });
  const playersEl = h('div', { class: 'ext-players' });
  const doneBtn = h('button', { class: 'ext-finish', type: 'button' }) as HTMLButtonElement;
  const backBtn = h('button', { class: 'secondary', type: 'button' }, 'Back') as HTMLButtonElement;
  const pickingEl = h('div', { class: 'center ext' }, pickTitle, pickNote, playersEl, doneBtn, backBtn);
  root.append(playingEl, pickingEl);

  finishBtn.addEventListener('click', () => {
    picking = true;
    winners.clear();
    render();
  });
  backBtn.addEventListener('click', () => {
    picking = false;
    render();
  });
  playersEl.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.ext-player')?.dataset.id;
    if (!id) return;
    if (winners.has(id)) winners.delete(id);
    else winners.add(id);
    render();
  });
  doneBtn.addEventListener('click', () => {
    if (sent) return;
    sent = true;
    send({ type: 'finish', winners: [...winners] } satisfies ExternalInput);
    render();
  });

  function render() {
    if (!view) return;
    const v = view;
    nameEl.textContent = v.name;
    finishBtn.hidden = !v.isVip;
    noteEl.textContent = v.isVip
      ? "Play it away from the app. When you're done, tap the button below and pick who won."
      : `Play it away from the app. When you're done, ${v.vipName} marks it finished and picks who won.`;

    const showPicker = picking && v.isVip;
    playingEl.hidden = showPicker;
    pickingEl.hidden = !showPicker;
    pickTitle.textContent = `Who won ${v.name}?`;
    pickNote.textContent = `Tap everyone who won (each gets ${v.winPoints.toLocaleString()} points), then Done.`;
    // Someone who's left can't be picked any more, so drop them.
    for (const id of [...winners]) if (!v.players.some((p) => p.id === id)) winners.delete(id);
    playersEl.replaceChildren(
      ...v.players.map((p) => {
        const on = winners.has(p.id);
        const btn = h('button', { class: `ext-player${on ? ' on' : ''}`, type: 'button', style: `--color:${p.color}` }, on ? `✓ ${p.name}` : p.name);
        btn.dataset.id = p.id;
        return btn;
      }),
    );
    doneBtn.textContent = sent ? 'Finishing…' : winners.size === 0 ? 'Done: no winner' : `Done: ${winners.size} winner${winners.size === 1 ? '' : 's'}`;
    doneBtn.disabled = backBtn.disabled = sent;
  }

  function tick() {
    if (!view) return;
    const secs = Math.floor((performance.now() - startedAt) / 1000);
    clockEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }
  const interval = setInterval(tick, 500);

  return {
    update(raw) {
      view = raw as ExternalPlayerView;
      startedAt = performance.now() - view.elapsedMs;
      // No longer the VIP: back to the game screen.
      if (!view.isVip) picking = false;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
