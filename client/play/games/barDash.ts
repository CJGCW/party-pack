import { BARS, LIVES, type BarInput, type BarPlayerView } from '../../../shared/games/barDash';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** Four big bar buttons: tap one to dash there and slide a drink down it. A glass coming back lights its bar. */
export function createBarDash(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: BarPlayerView | null = null;
  let phaseEndsAt = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const buttons = Array.from({ length: BARS }, (_, bar) => {
    const btn = h('button', { type: 'button', class: 'bd-bar' }, `Bar ${bar + 1}`) as HTMLButtonElement;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!view || view.phase !== 'play' || !isPlaying(view)) return;
      navigator.vibrate?.(10);
      send({ type: 'pour', bar } satisfies BarInput);
    });
    return btn;
  });
  const barsEl = h('div', { class: 'bd-bars' }, ...buttons);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, barsEl, infoEl));

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    barsEl.hidden = !playing;
    infoEl.hidden = playing;
    if (s) {
      msgEl.textContent = `${s.served} served · ${'♥'.repeat(s.lives)}${'♡'.repeat(Math.max(0, LIVES - s.lives))}`;
      buttons.forEach((b, i) => {
        b.classList.toggle('here', s.bar === i);
        b.classList.toggle('glass', s.glasses.includes(i));
      });
    }
    const info = boardsInfo(v, 'best', { ended: () => 'Out of lives!', score: (o) => `${o.boardScore} served` });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as BarPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
