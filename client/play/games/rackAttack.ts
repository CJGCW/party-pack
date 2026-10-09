import {
  LETTER_VALUES,
  SIZE,
  premiumAt,
  type Placement,
  type RackInput,
  type RackPlayerView,
  type ScoredMove,
} from '../../../shared/games/rackAttack';
import { h } from '../dom';
import type { Controller } from '../main';

const PREMIUM_LABEL = { TW: '3W', DW: '2W', TL: '3L', DL: '2L', STAR: '★' } as const;

/**
 * Tap a rack tile, then a square to put it there; tap a placed tile to take it back.
 * The phone asks the server to check the play as it changes, so the score (or the
 * problem) shows before you submit.
 */
export function createRackAttack(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: RackPlayerView | null = null;
  let phaseEndsAt = 0;
  let puzzleKey = '';
  /** Rack tiles in the order shown (indexes into view.rack). */
  let order: number[] = [];
  /** Tiles placed this turn: "row,col" -> rack index. */
  let pending = new Map<string, number>();
  let selected: number | null = null;
  let seq = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const boardEl = h('div', { class: 'ra-board' });
  const statusEl = h('div', { class: 'ra-status' });
  const rackEl = h('div', { class: 'ra-rack' });
  const shuffleBtn = h('button', { class: 'secondary', type: 'button' }, 'Shuffle');
  const recallBtn = h('button', { class: 'secondary', type: 'button' }, 'Recall');
  const submitBtn = h('button', { class: 'ra-submit', type: 'button' }, 'Submit');

  const cells: HTMLElement[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const premium = premiumAt(r, c);
      const cell = h('div', { class: `ra-cell${premium ? ` ra-${premium.toLowerCase()}` : ''}` });
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cells.push(cell);
      boardEl.append(cell);
    }
  }

  root.append(
    h(
      'div',
      { class: 'ra' },
      h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl),
      boardEl,
      statusEl,
      rackEl,
      h('div', { class: 'ra-buttons' }, shuffleBtn, recallBtn, submitBtn),
    ),
  );

  const locked = () => !view || view.phase !== 'play' || !!view.submitted;
  const placements = (): Placement[] =>
    [...pending].map(([key, i]) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col, letter: view!.rack[i] };
    });

  function changed() {
    seq++;
    send({ type: 'preview', seq, tiles: placements() } satisfies RackInput);
    render();
  }

  boardEl.addEventListener('pointerdown', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.ra-cell');
    if (!cell || locked()) return;
    e.preventDefault();
    const key = `${cell.dataset.row},${cell.dataset.col}`;
    if (pending.has(key)) {
      // Take it back to the rack.
      pending.delete(key);
      selected = null;
      changed();
    } else if (selected !== null && !view!.board[Number(cell.dataset.row)][Number(cell.dataset.col)]) {
      pending.set(key, selected);
      selected = null;
      changed();
    }
  });

  rackEl.addEventListener('pointerdown', (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('.ra-tile');
    if (!tile || locked()) return;
    e.preventDefault();
    const i = Number(tile.dataset.index);
    if ([...pending.values()].includes(i)) return;
    selected = selected === i ? null : i;
    render();
  });

  shuffleBtn.addEventListener('click', () => {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    render();
  });

  recallBtn.addEventListener('click', () => {
    if (locked() || pending.size === 0) return;
    pending = new Map();
    selected = null;
    changed();
  });

  submitBtn.addEventListener('click', () => {
    if (locked()) return;
    send({ type: 'submit', tiles: placements() } satisfies RackInput);
  });

  function tileHtml(letter: string) {
    return [h('span', { class: 'ra-letter' }, letter), h('span', { class: 'ra-value' }, String(LETTER_VALUES[letter] ?? ''))];
  }

  function describe(move: ScoredMove) {
    return move.words.map((w) => w.word).join(' · ');
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `ra-status ${kind}`;
  }

  function render() {
    if (!view) return;
    const v = view;
    // A new board: start fresh.
    const key = `${v.puzzleNumber}|${v.rack.join('')}|${v.board.map((r) => r.join(',')).join('/')}`;
    if (key !== puzzleKey) {
      puzzleKey = key;
      order = v.rack.map((_, i) => i);
      pending = new Map();
      selected = null;
    }

    headerEl.textContent = `Board ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;

    // Board: existing tiles, this turn's tiles, and at the reveal the best play.
    const shown = v.submitted && v.submitted.tiles.length > 0 ? new Map(v.submitted.tiles.map((t) => [`${t.row},${t.col}`, t.letter])) : null;
    const best = v.best ? new Map(v.best.tiles.map((t) => [`${t.row},${t.col}`, t.letter])) : null;
    for (const cell of cells) {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      const k = `${r},${c}`;
      const existing = v.board[r][c];
      const mine = shown?.get(k) ?? (pending.has(k) ? v.rack[pending.get(k)!] : undefined);
      const bestLetter = !existing && !mine ? best?.get(k) : undefined;
      const letter = existing || mine || bestLetter;
      cell.classList.toggle('filled', !!existing);
      cell.classList.toggle('pending', !existing && !!mine);
      cell.classList.toggle('best', !!bestLetter);
      cell.classList.toggle('target', !locked() && selected !== null && !existing && !mine);
      if (letter) cell.replaceChildren(...tileHtml(letter));
      else {
        const p = premiumAt(r, c);
        cell.replaceChildren(p ? PREMIUM_LABEL[p] : '');
      }
    }

    // Rack.
    const used = new Set(pending.values());
    rackEl.replaceChildren(
      ...order.map((i) => {
        const tile = h('div', { class: `ra-tile${used.has(i) || (v.submitted && v.submitted.tiles.length) ? ' used' : ''}${selected === i ? ' selected' : ''}` }, ...tileHtml(v.rack[i]));
        tile.dataset.index = String(i);
        return tile;
      }),
    );

    const preview = v.preview && v.preview.seq === seq ? v.preview.check : null;
    shuffleBtn.disabled = v.phase !== 'play';
    recallBtn.disabled = locked() || pending.size === 0;
    submitBtn.disabled = locked() || (pending.size > 0 && preview !== null && !preview.ok);
    submitBtn.textContent = pending.size === 0 ? 'Pass' : preview?.ok ? `Submit · ${preview.score}` : 'Submit';

    if (v.phase === 'play') {
      if (v.submitted) {
        setStatus(v.submitted.tiles.length ? `Locked in: ${describe(v.submitted)} for ${v.submitted.score}. Waiting…` : 'You passed. Waiting…', 'good');
      } else if (v.submitError && pending.size > 0) {
        setStatus(v.submitError, 'bad');
      } else if (pending.size === 0) {
        setStatus(selected !== null ? 'Now tap a square on the board.' : 'Tap a tile, then a square.');
      } else if (!preview) {
        setStatus('Checking…');
      } else if (preview.ok) {
        setStatus(`${describe(preview)} = ${preview.score}${preview.tiles.length === 7 ? ' (all 7: +50!)' : ''}`, 'good');
      } else {
        setStatus(preview.error, 'bad');
      }
    } else if (v.phase === 'reveal') {
      const mine = v.submitted?.tiles.length ? `You: ${v.submitted.score} (+${v.points})` : 'No play this time';
      setStatus(`${mine}. Best: ${v.best ? `${describe(v.best)} for ${v.best.score}` : '-'}`, v.points > 0 ? 'good' : '');
    } else {
      setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
    }
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const playing = view.phase === 'play' && !view.submitted;
    timerEl.textContent = playing ? `${secs}s` : '';
    timerEl.classList.toggle('low', playing && secs <= 10);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as RackPlayerView;
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
