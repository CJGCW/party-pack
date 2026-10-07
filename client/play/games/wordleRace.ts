import {
  WORD_LENGTH,
  describeDefinition,
  type LetterResult,
  type WordleInput,
  type WordlePlayerView,
} from '../../../shared/games/wordleRace';
import { h } from '../dom';
import type { Controller } from '../main';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '⏎ZXCVBNM⌫'];
const RANK: Record<LetterResult, number> = { absent: 1, present: 2, correct: 3 };
/** Rows shown before the board starts growing (and scrolling). */
const MIN_ROWS = 6;
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export function createWordleRace(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: WordlePlayerView | null = null;
  let typed = '';
  let awaitingReply = false;
  let phaseEndsAt = 0;
  let revealedRows = 0;
  let overlayKey = '';

  const roundEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'wr-msg' });
  const overlay = h('div', { class: 'wr-overlay', hidden: true });

  const boardEl = h('div', { class: 'wr-board' });
  const rows: { el: HTMLDivElement; tiles: HTMLDivElement[] }[] = [];

  /** Guesses are unlimited, so rows are added as needed. */
  function ensureRows(count: number) {
    while (rows.length < count) {
      const tiles = Array.from({ length: WORD_LENGTH }, () => h('div', { class: 'wr-tile' }));
      const el = h('div', { class: 'wr-row' }, ...tiles);
      rows.push({ el, tiles });
      boardEl.append(el);
    }
    while (rows.length > count) rows.pop()!.el.remove();
  }

  const keyEls = new Map<string, HTMLButtonElement>();
  const keyboard = h(
    'div',
    { class: 'wr-keys' },
    ...KEY_ROWS.map((row) =>
      h(
        'div',
        { class: 'wr-keyrow' },
        ...[...row].map((k) => {
          const label = k === '⏎' ? 'ENTER' : k;
          const btn = h('button', { class: `wr-key${k === '⏎' || k === '⌫' ? ' wide' : ''}`, type: 'button' }, label);
          // pointerdown feels snappier than click on phones.
          btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            press(k);
          });
          keyEls.set(k, btn);
          return btn;
        }),
      ),
    ),
  );

  root.append(
    h(
      'div',
      { class: 'wr' },
      h('div', { class: 'wr-top' }, roundEl, timerEl, scoreEl),
      msgEl,
      boardEl,
      keyboard,
    ),
    overlay,
  );

  function canType() {
    return !!view && view.phase === 'playing' && !view.solved && !awaitingReply;
  }

  function press(key: string) {
    if (!canType()) return;
    if (key === '⌫') {
      typed = typed.slice(0, -1);
    } else if (key === '⏎') {
      if (typed.length < WORD_LENGTH) {
        showMessage('Not enough letters', 'error');
        shakeCurrentRow();
        return;
      }
      awaitingReply = true;
      send({ type: 'guess', word: typed } satisfies WordleInput);
    } else if (typed.length < WORD_LENGTH) {
      typed += key;
    }
    drawBoard();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') press('⏎');
    else if (e.key === 'Backspace') press('⌫');
    else if (/^[a-z]$/i.test(e.key)) press(e.key.toUpperCase());
  }
  window.addEventListener('keydown', onKeyDown);

  function showMessage(text: string, kind: '' | 'error' | 'good' = '') {
    msgEl.textContent = text;
    msgEl.className = `wr-msg ${kind}`;
  }

  function shakeCurrentRow() {
    const row = rows[view?.guesses.length ?? 0]?.el;
    if (!row) return;
    row.classList.remove('shake');
    void row.offsetWidth; // restart the animation
    row.classList.add('shake');
  }

  function drawBoard() {
    if (!view) return;
    // One row per guess, plus the row being typed, never fewer than MIN_ROWS.
    const activeRow = view.solved ? 0 : 1;
    ensureRows(Math.max(MIN_ROWS, view.guesses.length + activeRow));
    rows.forEach((row, r) => {
      const guess = view!.guesses[r];
      row.tiles.forEach((tile, c) => {
        if (guess) {
          tile.textContent = guess.word[c];
          tile.className = `wr-tile ${guess.result[c]}`;
          if (r >= revealedRows) {
            tile.classList.add('reveal');
            tile.style.animationDelay = `${c * 0.12}s`;
          }
        } else if (r === view!.guesses.length) {
          tile.textContent = typed[c] ?? '';
          tile.className = `wr-tile${typed[c] ? ' filled' : ''}`;
        } else {
          tile.textContent = '';
          tile.className = 'wr-tile';
        }
      });
    });
    const grew = view.guesses.length > revealedRows;
    revealedRows = view.guesses.length;
    // Keep the row being typed (or the newest guess) in view as the board grows.
    if (grew || view.guesses.length >= MIN_ROWS) {
      rows[Math.min(view.guesses.length, rows.length - 1)].el.scrollIntoView({ block: 'nearest' });
    }

    // Keyboard colours: the best result seen for each letter.
    const best = new Map<string, LetterResult>();
    for (const g of view.guesses) {
      [...g.word].forEach((letter, i) => {
        const prev = best.get(letter);
        if (!prev || RANK[g.result[i]] > RANK[prev]) best.set(letter, g.result[i]);
      });
    }
    for (const [key, el] of keyEls) {
      el.className = `wr-key${key === '⏎' || key === '⌫' ? ' wide' : ''} ${best.get(key) ?? ''}`;
    }
  }

  function drawOverlay() {
    if (!view) return;
    const key = `${view.round}|${view.phase}`;
    if (key === overlayKey) return;
    overlayKey = key;

    if (view.phase === 'countdown') {
      overlay.replaceChildren(
        h('h2', {}, `Round ${view.round} of ${view.totalRounds}`),
        h('div', { class: 'big' }, 'Get ready!'),
        h('p', {}, 'Guess the 5-letter word before everyone else.'),
      );
      overlay.hidden = false;
    } else if (view.phase === 'roundEnd' || view.phase === 'gameEnd') {
      const answer = view.answer ?? '';
      overlay.replaceChildren(
        h('p', {}, 'The word was'),
        h('div', { class: 'wr-answer' }, ...[...answer].map((l) => h('div', { class: 'wr-tile correct' }, l))),
        h('p', { class: 'wr-definition' }, describeDefinition(view.definition)),
        h('h2', {}, view.solved ? `You placed ${ORDINAL[(view.finishRank ?? 1) - 1]}! +${view.roundPoints}` : 'No points this round'),
        h('div', { class: 'big' }, String(view.score)),
        h('p', {}, view.phase === 'gameEnd' ? 'Final score. Look at the TV!' : 'Next round coming up…'),
      );
      overlay.hidden = false;
    } else {
      overlay.hidden = true;
    }
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'playing' ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    timerEl.classList.toggle('low', view.phase === 'playing' && secs <= 15);
  }
  const interval = setInterval(tick, 250);

  return {
    update(raw) {
      const next = raw as WordlePlayerView;
      const newRound = !view || next.round !== view.round;
      const replyArrived = awaitingReply;
      const guessAccepted = !!view && next.guesses.length > view.guesses.length;

      if (newRound) {
        typed = '';
        revealedRows = 0;
        awaitingReply = false;
        showMessage('');
      }
      view = next;
      phaseEndsAt = performance.now() + next.msLeft;
      roundEl.textContent = `Round ${next.round}/${next.totalRounds}`;
      scoreEl.textContent = `${next.score} pts`;

      if (replyArrived) {
        awaitingReply = false;
        if (guessAccepted) typed = '';
        else if (next.error) {
          showMessage(next.error, 'error');
          shakeCurrentRow();
        }
      }

      if (next.solved) showMessage(`Solved! ${ORDINAL[(next.finishRank ?? 1) - 1]} place, +${next.roundPoints}`, 'good');      else if (next.phase === 'playing' && guessAccepted) showMessage('');

      drawBoard();
      drawOverlay();
      tick();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
      root.replaceChildren();
    },
  };
}
