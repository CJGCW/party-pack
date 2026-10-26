import { COOP_CLEAR_POINTS, COOP_PENALTY_MS, type PickCoopInput, type PickCoopPlayerView } from '../../../shared/games/pickEm';
import { h } from '../dom';
import type { Controller } from '../main';

const PENALTY_SECS = COOP_PENALTY_MS / 1000;

/**
 * Team Pick 'Em on the phone: the same list as everyone else, where every tap or guess
 * counts straight away. Right answers light up for the whole team; wrong ones cost time.
 */
export function createPickEmCoop(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PickCoopPlayerView | null = null;
  let phaseEndsAt = 0;
  let seq = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const foundEl = h('span');
  const topicEl = h('div', { class: 'tu-category' });
  const questionEl = h('div', { class: 'tv-question' });
  const hintEl = h('div', { class: 'tv-multi' });
  const gridEl = h('div', { class: 'pe-grid' });
  const statusEl = h('div', { class: 'tu-status' });

  // Typed lists: a text box, and the answers the team has found so far.
  const inputEl = h('input', { class: 'pe-input', type: 'text', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'send', placeholder: 'Type an answer', maxlength: '60' });
  const formEl = h(
    'form',
    {
      class: 'pe-form',
      onsubmit: (e) => {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (!text || view?.phase !== 'answering') return;
        seq++;
        send({ type: 'guess', seq, text } satisfies PickCoopInput);
        inputEl.value = '';
        inputEl.focus();
      },
    },
    inputEl,
    h('button', { type: 'submit' }, 'Enter'),
  );
  const chipsEl = h('div', { class: 'pe-found' });
  const typedEl = h('div', { class: 'pe-typed' }, formEl, chipsEl);

  root.append(
    h('div', { class: 'tv' }, h('div', { class: 'wr-top' }, headerEl, timerEl, foundEl), topicEl, questionEl, hintEl, gridEl, typedEl, statusEl),
  );

  // Tap lists: a tap counts straight away, for the whole team.
  gridEl.addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.pe-option');
    if (!btn || view?.phase !== 'answering') return;
    e.preventDefault();
    seq++;
    send({ type: 'tap', seq, index: Number(btn.dataset.index) } satisfies PickCoopInput);
  });

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  function render() {
    if (!view) return;
    const v = view;
    const typed = v.kind === 'typed';
    const revealing = v.phase === 'reveal' || v.phase === 'gameEnd';
    headerEl.textContent = v.heading ?? `List ${v.questionNumber}/${v.totalQuestions}`;
    foundEl.textContent = `${v.found}/${v.total} found`;
    topicEl.textContent = v.topic;
    questionEl.textContent = v.question;
    hintEl.hidden = v.phase === 'gameEnd';
    hintEl.textContent = typed ? `Team list · type answers · wrong costs ${PENALTY_SECS} sec` : `Team list · tap the right ones · wrong costs ${PENALTY_SECS} sec`;

    gridEl.hidden = typed || v.tiles.length === 0 || v.phase === 'gameEnd';
    if (!typed) {
      gridEl.replaceChildren(
        ...v.tiles.map((t, i) => {
          const cls = { open: '', found: ' right', wrong: ' wrong', missed: ' missed' }[t.state];
          const btn = h('button', { class: `pe-option${cls}`, type: 'button' }, t.label ?? '');
          if (t.by) btn.append(h('span', { class: 'pe-by' }, t.by.name));
          btn.dataset.index = String(i);
          return btn;
        }),
      );
    }

    typedEl.hidden = !typed || v.tiles.length === 0 || v.phase === 'gameEnd';
    formEl.hidden = v.phase !== 'answering';
    if (typed) {
      // The team's finds (each in its finder's colour); at the reveal, the misses too.
      chipsEl.replaceChildren(
        ...v.tiles.flatMap((t) => {
          if (t.state === 'found') {
            const chip = h('span', { class: 'pe-chip mine' }, t.label ?? '');
            if (t.by) chip.style.boxShadow = `inset 0 -4px 0 ${t.by.color}`;
            return [chip];
          }
          return revealing && t.label ? [h('span', { class: 'pe-chip missed' }, t.label)] : [];
        }),
      );
    }

    switch (v.phase) {
      case 'question':
        setStatus(typed ? 'Read the question… get ready to type!' : 'Read the question… the list is coming!');
        break;
      case 'answering': {
        const g = v.lastGuess;
        if (!g || g.seq !== seq) setStatus(typed ? 'Type an answer and press Enter.' : 'Tap an answer you think is right.');
        else if (g.result === 'right') setStatus(`Got it: ${g.answer}`, 'good');
        else if (g.result === 'repeat') setStatus(g.answer ? `${g.answer} was already picked. No time lost.` : `"${g.text}" was already tried. No time lost.`);
        else setStatus(`"${g.text}" isn't on the list. −${PENALTY_SECS}s`, 'bad');
        break;
      }
      case 'reveal':
        if (v.cleared) setStatus(`Cleared! The team found all ${v.total}. +${COOP_CLEAR_POINTS} each`, 'good');
        else setStatus(`Out of time: the team found ${v.found} of ${v.total}.`, 'bad');
        break;
      case 'gameEnd':
        setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
    // Keep the keyboard up while typing.
    if (typed && v.phase === 'answering' && document.activeElement !== inputEl) inputEl.focus();
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const playing = view.phase === 'answering';
    timerEl.textContent = playing ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    timerEl.classList.toggle('low', playing && secs <= 20);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as PickCoopPlayerView;
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
