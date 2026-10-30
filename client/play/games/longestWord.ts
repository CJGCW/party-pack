import { LETTER_COUNT, canPick, type LongestInput, type LongestPlayerView, type WordProblem } from '../../../shared/games/longestWord';
import { h } from '../dom';
import type { Controller } from '../main';

const PROBLEM: Record<Exclude<WordProblem, null>, string> = {
  'not-a-word': "isn't in the dictionary",
  'bad-letters': "uses letters that aren't there",
};

/**
 * While picking: the picker taps Vowel or Consonant for each letter; everyone else watches.
 * While solving: tap the letters to spell a word, tap a letter in the word to put it back.
 * The word as it stands goes to the server on every change, so it counts when time runs out
 * even if it isn't locked in.
 */
export function createLongestWord(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: LongestPlayerView | null = null;
  let phaseEndsAt = 0;
  let puzzleKey = '';
  /** Letters in the order shown (indexes into view.letters). */
  let order: number[] = [];
  /** The word being spelt, as indexes into view.letters. */
  let spelt: number[] = [];

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const lettersEl = h('div', { class: 'lw-letters' });
  const wordEl = h('div', { class: 'lw-word' });
  const statusEl = h('div', { class: 'ra-status' });
  const vowelBtn = h('button', { type: 'button', class: 'lw-pick' }, 'Vowel') as HTMLButtonElement;
  const consonantBtn = h('button', { type: 'button', class: 'lw-pick' }, 'Consonant') as HTMLButtonElement;
  const pickEl = h('div', { class: 'lw-pick-buttons' }, vowelBtn, consonantBtn);
  const shuffleBtn = h('button', { class: 'secondary', type: 'button' }, 'Shuffle') as HTMLButtonElement;
  const clearBtn = h('button', { class: 'secondary', type: 'button' }, 'Clear') as HTMLButtonElement;
  const lockBtn = h('button', { class: 'ra-submit', type: 'button' }, 'Lock in') as HTMLButtonElement;
  const solveEl = h('div', { class: 'ra-buttons' }, shuffleBtn, clearBtn, lockBtn);

  root.append(
    h('div', { class: 'ra lw' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), wordEl, statusEl, lettersEl, pickEl, solveEl),
  );

  const solving = () => !!view && view.phase === 'solve' && !view.locked;
  const word = () => spelt.map((i) => view!.letters[i]).join('');

  function changed() {
    send({ type: 'word', word: word(), lock: false } satisfies LongestInput);
    render();
  }

  lettersEl.addEventListener('pointerdown', (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('.ra-tile');
    if (!tile || !solving()) return;
    e.preventDefault();
    const i = Number(tile.dataset.index);
    if (spelt.includes(i)) return;
    spelt.push(i);
    navigator.vibrate?.(10);
    changed();
  });

  wordEl.addEventListener('pointerdown', (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('.ra-tile');
    if (!tile || !solving()) return;
    e.preventDefault();
    spelt.splice(Number(tile.dataset.pos), 1);
    changed();
  });

  const pick = (kind: 'vowel' | 'consonant') => send({ type: 'pick', kind } satisfies LongestInput);
  vowelBtn.addEventListener('click', () => pick('vowel'));
  consonantBtn.addEventListener('click', () => pick('consonant'));

  shuffleBtn.addEventListener('click', () => {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    render();
  });

  clearBtn.addEventListener('click', () => {
    if (!solving() || spelt.length === 0) return;
    spelt = [];
    changed();
  });

  lockBtn.addEventListener('click', () => {
    if (!solving() || spelt.length === 0) return;
    send({ type: 'word', word: word(), lock: true } satisfies LongestInput);
  });

  function tile(letter: string, extra = '') {
    return h('div', { class: `ra-tile${extra}` }, h('span', { class: 'ra-letter' }, letter));
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `ra-status ${kind}`;
  }

  /** Back from a reconnect: spell out the word the server has, using the letters there are. */
  function respell(target: string, letters: string[]) {
    const free = letters.map((_, i) => i);
    spelt = [];
    for (const ch of target) {
      const at = free.findIndex((i) => letters[i] === ch);
      if (at < 0) break;
      spelt.push(free.splice(at, 1)[0]);
    }
  }

  function render() {
    if (!view) return;
    const v = view;
    const key = `${v.puzzleNumber}|${v.phase === 'pick' ? 'pick' : v.letters.join('')}`;
    if (key !== puzzleKey) {
      puzzleKey = key;
      order = v.letters.map((_, i) => i);
      respell(v.word, v.letters);
    }

    headerEl.textContent = `Word ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;

    // The letters: nine slots, filled in as they're picked.
    const used = new Set(spelt);
    lettersEl.replaceChildren(
      ...Array.from({ length: LETTER_COUNT }, (_, slot) => {
        if (v.phase === 'pick') return v.letters[slot] ? tile(v.letters[slot]) : h('div', { class: 'ra-tile lw-empty' });
        const i = order[slot];
        const el = tile(v.letters[i], used.has(i) && v.phase === 'solve' ? ' used' : '');
        el.dataset.index = String(i);
        return el;
      }),
    );

    // The word being spelt (or, once it's over, the word that was in).
    const shown = v.phase === 'solve' && !v.locked ? word() : v.word;
    wordEl.replaceChildren(
      ...[...shown].map((l, pos) => {
        const el = tile(l, v.phase === 'reveal' && v.problem ? ' lw-bad' : '');
        el.dataset.pos = String(pos);
        return el;
      }),
    );
    wordEl.hidden = v.phase === 'pick';

    pickEl.hidden = !(v.phase === 'pick' && v.isPicker);
    vowelBtn.disabled = !canPick(v.letters, 'vowel');
    consonantBtn.disabled = !canPick(v.letters, 'consonant');
    solveEl.hidden = v.phase !== 'solve';
    shuffleBtn.disabled = !solving();
    clearBtn.disabled = !solving() || spelt.length === 0;
    lockBtn.disabled = !solving() || spelt.length === 0;
    lockBtn.textContent = spelt.length ? `Lock in · ${spelt.length}` : 'Lock in';

    if (v.phase === 'pick') {
      const left = LETTER_COUNT - v.letters.length;
      if (v.isPicker) setStatus(`Your pick! ${left} letter${left === 1 ? '' : 's'} to go. At least 3 vowels and 4 consonants.`, 'good');
      else setStatus(`${v.pickerName} is picking the letters…`);
    } else if (v.phase === 'solve') {
      if (v.locked) setStatus(v.word ? `Locked in: ${v.word} (${v.word.length}). Waiting…` : 'Waiting for everyone else…', 'good');
      else setStatus(spelt.length ? `${spelt.length} letter${spelt.length === 1 ? '' : 's'}. Tap a letter in the word to put it back.` : 'Tap the letters to spell the longest word you can.');
    } else if (v.phase === 'reveal') {
      const best = v.best && v.best.length ? `Longest: ${v.best.words.join(', ')} (${v.best.length})` : 'Nothing could be made!';
      if (!v.word) setStatus(`No word this time. ${best}`);
      else if (v.problem) setStatus(`${v.word} ${PROBLEM[v.problem]}. ${best}`, 'bad');
      else setStatus(`${v.word}: ${v.word.length} letters, +${v.points}. ${best}`, 'good');
    } else {
      setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
    }
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const timed = (view.phase === 'solve' && !view.locked) || (view.phase === 'pick' && view.isPicker);
    timerEl.textContent = timed ? `${secs}s` : '';
    timerEl.classList.toggle('low', timed && secs <= 5);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as LongestPlayerView;
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
