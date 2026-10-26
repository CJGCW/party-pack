import type { PickInput, PickPlayerView } from '../../../shared/games/pickEm';
import { h } from '../dom';
import type { Controller } from '../main';

export function createPickEm(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PickPlayerView | null = null;
  let phaseEndsAt = 0;
  let questionKey = '';
  /** Options toggled on, before locking in. */
  let selected = new Set<number>();
  /** Sent but not yet confirmed by the server, so the tap feels instant. */
  let pendingLock: number[] | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const topicEl = h('div', { class: 'tu-category' });
  const questionEl = h('div', { class: 'tv-question' });
  const hintEl = h('div', { class: 'tv-multi' }, 'Pick all that apply · wrong picks cost points');
  const gridEl = h('div', { class: 'pe-grid' });
  const statusEl = h('div', { class: 'tu-status' });
  const lockBtn = h('button', { class: 'tv-lock', type: 'button' }, 'Lock in');

  // Typed lists: a text box, the answers you've found so far, and "I'm done".
  let seq = 0;
  const inputEl = h('input', { class: 'pe-input', type: 'text', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'send', placeholder: 'Type an answer', maxlength: '60' });
  const enterBtn = h('button', { type: 'submit' }, 'Enter');
  const formEl = h(
    'form',
    {
      class: 'pe-form',
      onsubmit: (e) => {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (!text || view?.phase !== 'answering' || view.done) return;
        seq++;
        send({ type: 'guess', seq, text } satisfies PickInput);
        inputEl.value = '';
        inputEl.focus();
      },
    },
    inputEl,
    enterBtn,
  );
  const foundTitleEl = h('div', { class: 'pe-found-title' });
  const foundEl = h('div', { class: 'pe-found' });
  const doneBtn = h('button', { class: 'secondary', type: 'button' }, "I'm done");
  doneBtn.addEventListener('click', () => {
    if (view?.phase === 'answering' && !view.done) send({ type: 'done' } satisfies PickInput);
  });
  const typedEl = h('div', { class: 'pe-typed' }, formEl, foundTitleEl, foundEl, doneBtn);

  root.append(
    h(
      'div',
      { class: 'tv' },
      h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl),
      topicEl,
      questionEl,
      hintEl,
      gridEl,
      typedEl,
      statusEl,
      lockBtn,
    ),
  );

  const locked = () => (view && view.myPicks.length > 0 ? view.myPicks : (pendingLock ?? []));
  const canPick = () => view?.phase === 'answering' && locked().length === 0;

  gridEl.addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.pe-option');
    if (!btn || !canPick()) return;
    e.preventDefault();
    const i = Number(btn.dataset.index);
    if (selected.has(i)) selected.delete(i);
    else selected.add(i);
    render();
  });

  lockBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!canPick() || selected.size === 0) return;
    pendingLock = [...selected].sort((a, b) => a - b);
    send({ type: 'answer', indices: pendingLock } satisfies PickInput);
    render();
  });

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  function render() {
    if (!view) return;
    const v = view;
    const key = `${v.questionNumber}|${v.question}`;
    if (key !== questionKey) {
      questionKey = key;
      selected = new Set();
      pendingLock = null;
    }
    headerEl.textContent = v.heading ?? `List ${v.questionNumber}/${v.totalQuestions}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    topicEl.textContent = v.topic;
    questionEl.textContent = v.question;
    hintEl.hidden = v.phase === 'gameEnd';

    if (v.kind === 'typed') {
      renderTyped(v);
      return;
    }
    typedEl.hidden = true;
    hintEl.textContent = 'Pick all that apply · wrong picks cost points';
    const mine = locked();
    const picked = mine.length > 0 ? mine : [...selected];
    const revealing = v.phase === 'reveal' || v.phase === 'gameEnd';
    const correct = v.correctIndices ?? [];
    gridEl.hidden = v.phase === 'gameEnd' || v.options.length === 0;
    // Nine options sit in rows of three, like the TV; twelve in rows of two.
    gridEl.classList.toggle('three', v.options.length === 9);
    gridEl.replaceChildren(
      ...v.options.map((o, i) => {
        const isPicked = picked.includes(i);
        const isRight = correct.includes(i);
        let cls = 'pe-option';
        if (revealing) cls += isRight ? (isPicked ? ' right' : ' missed') : isPicked ? ' wrong' : ' dimmed';
        else if (isPicked) cls += ' picked';
        const btn = h('button', { class: cls, type: 'button' }, o);
        btn.dataset.index = String(i);
        return btn;
      }),
    );
    lockBtn.hidden = v.phase !== 'answering' || mine.length > 0;
    lockBtn.disabled = selected.size === 0;
    lockBtn.textContent = selected.size > 0 ? `Lock in ${selected.size}` : 'Lock in';

    switch (v.phase) {
      case 'question':
        setStatus('Read the question… the list is coming!');
        break;
      case 'answering':
        if (mine.length > 0) setStatus('Locked in! Waiting for everyone…');
        else setStatus('Tap every right answer, then lock in.');
        break;
      case 'reveal': {
        const missed = correct.filter((i) => !v.myPicks.includes(i)).length;
        if (v.myPicks.length === 0) setStatus(`Out of time. There were ${correct.length} right answers.`, 'bad');
        else
          setStatus(
            `${v.right} right, ${v.wrong} wrong${missed ? `, ${missed} missed` : ''}: ${v.points > 0 ? `+${v.points}` : 'no points'}`,
            v.points > 0 ? 'good' : 'bad',
          );
        break;
      }
      case 'gameEnd':
        setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
  }

  /** Typed lists: your answers stay on your phone; the TV only shows how many you have. */
  function renderTyped(v: PickPlayerView) {
    gridEl.hidden = true;
    lockBtn.hidden = true;
    const playing = v.phase === 'answering' && !v.done;
    typedEl.hidden = v.phase === 'question' || v.phase === 'gameEnd';
    formEl.hidden = !playing;
    doneBtn.hidden = !playing;
    hintEl.textContent = 'Type as many as you can · wrong guesses are free';
    foundTitleEl.textContent = v.phase === 'reveal' ? `You found ${v.found.length} of ${v.slots}` : `Found ${v.found.length} of ${v.slots}`;

    const chips =
      v.phase === 'reveal' && v.answers
        ? v.answers.map((a) => h('span', { class: `pe-chip ${v.found.includes(a) ? 'mine' : 'missed'}` }, a))
        : v.found.map((a) => h('span', { class: 'pe-chip mine' }, a));
    foundEl.replaceChildren(...chips);

    switch (v.phase) {
      case 'question':
        setStatus('Read the question… get ready to type!');
        break;
      case 'answering': {
        if (v.done) {
          setStatus("You're done! Waiting for everyone…", 'good');
          break;
        }
        const g = v.lastGuess;
        if (!g || g.seq !== seq) setStatus('Type an answer and press Enter.');
        else if (g.result === 'right') setStatus(`Got it: ${g.answer}`, 'good');
        else if (g.result === 'repeat') setStatus(`You already have ${g.answer}.`);
        else setStatus(`"${g.text}" isn't on the list.`, 'bad');
        break;
      }
      case 'reveal':
        setStatus(v.points > 0 ? `+${v.points}` : 'No points this time.', v.points > 0 ? 'good' : 'bad');
        break;
      case 'gameEnd':
        setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
    // Keep the keyboard up while typing.
    if (playing && document.activeElement !== inputEl) inputEl.focus();
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'answering' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'answering' && secs <= 5);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as PickPlayerView;
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
