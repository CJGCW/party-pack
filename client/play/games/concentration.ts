import { parseCard } from '../../../shared/cards';
import type { ConcentrationInput, ConcentrationPlayerView } from '../../../shared/games/concentration';
import { cardElement } from '../cards';
import { h } from '../dom';
import type { Controller } from '../main';

/** How long a pair that didn't match stays face up. */
const MISS_SHOW_MS = 900;
const GAP = 6;

/** Concentration on the phone: tap two cards; a match stays up, a miss turns back over. */
export function createConcentration(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: ConcentrationPlayerView | null = null;
  let phaseEndsAt = 0;
  /** A miss being shown, until it times out or the next card is tapped. */
  let showingMiss: { seq: number; cells: number[]; cards: string[] } | null = null;
  let missTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMissSeq = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const pairsEl = h('span');
  const gridEl = h('div', { class: 'cn-grid' });
  const statusEl = h('div', { class: 'tu-status' });
  root.append(h('div', { class: 'cn' }, h('div', { class: 'wr-top' }, headerEl, timerEl, pairsEl), gridEl, statusEl));

  gridEl.addEventListener('pointerdown', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!cell || view?.phase !== 'playing' || view.finishRank !== null) return;
    e.preventDefault();
    const index = Number(cell.dataset.cell);
    if (view.cells[index].state !== 'down') return;
    // Tapping on turns a shown miss back over straight away.
    clearMiss();
    send({ type: 'flip', index } satisfies ConcentrationInput);
  });

  function clearMiss() {
    if (missTimer) clearTimeout(missTimer);
    missTimer = null;
    showingMiss = null;
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  /** Cards as big as fit: the full width of the phone, and not taller than most of the screen. */
  function sizeCards(size: number) {
    const width = Math.min(window.innerWidth, 520) - 32;
    const height = window.innerHeight - 190;
    const byWidth = (width - GAP * (size - 1)) / size;
    const byHeight = (height - GAP * (size - 1)) / size / 1.4;
    gridEl.style.setProperty('--card-w', `${Math.floor(Math.min(byWidth, byHeight))}px`);
    gridEl.style.gridTemplateColumns = `repeat(${size}, auto)`;
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Board ${v.round}/${v.totalRounds}`;
    pairsEl.textContent = `${v.pairsFound}/${v.totalPairs} pairs`;
    sizeCards(v.size);

    // A new miss: show it for a moment.
    if (v.lastMiss && v.lastMiss.seq !== lastMissSeq) {
      lastMissSeq = v.lastMiss.seq;
      clearMiss();
      showingMiss = { seq: v.lastMiss.seq, cells: [...v.lastMiss.cells], cards: [...v.lastMiss.cards] };
      missTimer = setTimeout(() => {
        clearMiss();
        render();
      }, MISS_SHOW_MS);
    }

    gridEl.replaceChildren(
      ...v.cells.map((cell, i) => {
        let el: HTMLElement;
        const missIndex = showingMiss?.cells.indexOf(i) ?? -1;
        if (cell.state === 'blank') el = h('div', { class: 'pcard cn-blank' });
        else if (missIndex >= 0) el = cardElement(parseCard(showingMiss!.cards[missIndex]));
        else if (cell.card) el = cardElement(parseCard(cell.card));
        else el = cardElement(null);
        if (cell.state === 'matched') el.classList.add('cn-matched');
        if (cell.state === 'open') el.classList.add('cn-open');
        if (missIndex >= 0) el.classList.add('cn-miss');
        // Revealed at the end of the round: the ones you didn't find.
        if (cell.state === 'down' && cell.card) el.classList.add('cn-unfound');
        el.dataset.cell = String(i);
        return el;
      }),
    );

    switch (v.phase) {
      case 'countdown':
        setStatus('Get ready… find every pair!');
        break;
      case 'playing':
        if (v.finishRank !== null) setStatus(`Cleared! #${v.finishRank} · +${v.roundPoints.toLocaleString()}`, 'good');
        else if (showingMiss) setStatus('Not a match.', 'bad');
        else setStatus(`${v.guesses} guess${v.guesses === 1 ? '' : 'es'} · each costs ${v.guessCostSeconds}s of points`);
        break;
      case 'roundEnd':
        if (v.finishRank !== null) setStatus(`Cleared in ${v.guesses} guesses: +${v.roundPoints.toLocaleString()}`, 'good');
        else setStatus(`Time's up! You found ${v.pairsFound} of ${v.totalPairs} pairs.`, 'bad');
        break;
      case 'gameEnd':
        setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const playing = view.phase === 'playing' || view.phase === 'countdown';
    timerEl.textContent = playing ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'playing' && secs <= 10);
  }
  const interval = setInterval(tick, 200);
  const onResize = () => view && sizeCards(view.size);
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      view = raw as ConcentrationPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      // A new board: forget any miss from the last one.
      if (view.phase === 'countdown') {
        clearMiss();
        lastMissSeq = view.lastMiss?.seq ?? 0;
      }
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      clearMiss();
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
