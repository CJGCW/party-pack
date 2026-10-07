import { HIDDEN, type TossUpInput, type TossUpPlayerView } from '../../../shared/games/tossUp';
import { h } from '../dom';
import type { Controller } from '../main';

export function createTossUp(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TossUpPlayerView | null = null;
  let phaseEndsAt = 0;
  /** Set when we've just tapped BUZZ and are waiting to hear if we got it. */
  let buzzPending = false;
  let statusKey = '';

  const headerEl = h('span');
  const valueEl = h('span', { class: 'tu-value' });
  const scoreEl = h('span');
  const categoryEl = h('div', { class: 'tu-category' });
  const boardEl = h('div', { class: 'tu-board' });
  const statusEl = h('div', { class: 'tu-status' });

  const buzzButton = h('button', { class: 'tu-buzz', type: 'button' }, 'BUZZ');
  const answerInput = h('input', {
    class: 'tu-input',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: 'Type the answer',
    maxlength: '80',
  });
  const timerEl = h('div', { class: 'tu-timer' });
  const answerForm = h(
    'form',
    {
      class: 'tu-answer',
      onsubmit: (e) => {
        e.preventDefault();
        if (!answerInput.value.trim()) return;
        send({ type: 'answer', text: answerInput.value } satisfies TossUpInput);
        answerInput.disabled = true;
      },
    },
    timerEl,
    answerInput,
    h('button', { type: 'submit' }, 'Solve'),
  );

  // Show the answer box immediately on tap: phones only open the keyboard when
  // focus happens inside the tap itself, not after the server replies.
  buzzButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!view?.canBuzz || buzzPending) return;
    buzzPending = true;
    send({ type: 'buzz' } satisfies TossUpInput);
    showAnswerBox();
  });

  root.append(
    h(
      'div',
      { class: 'tu' },
      h('div', { class: 'wr-top' }, headerEl, valueEl, scoreEl),
      categoryEl,
      boardEl,
      statusEl,
      buzzButton,
      answerForm,
    ),
  );

  function showAnswerBox() {
    answerInput.value = '';
    answerInput.disabled = false;
    buzzButton.hidden = true;
    answerForm.hidden = false;
    answerInput.focus();
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  function drawBoard(lines: string[]) {
    boardEl.replaceChildren(
      ...lines.map((line) =>
        h(
          'div',
          { class: 'tu-line' },
          ...[...line].map((ch) =>
            h('span', { class: ch === ' ' ? 'tu-gap' : ch === HIDDEN ? 'tu-cell' : 'tu-cell shown' }, ch === HIDDEN ? '' : ch),
          ),
        ),
      ),
    );
  }

  function render() {
    if (!view) return;
    headerEl.textContent = `Puzzle ${view.puzzleNumber}/${view.totalPuzzles}`;
    valueEl.textContent = view.value.toLocaleString();
    scoreEl.textContent = `${view.score.toLocaleString()} pts`;
    categoryEl.textContent = view.category;
    drawBoard(view.lines);

    // We tapped BUZZ but someone else got there first.
    if (buzzPending && view.phase !== 'revealing' && !view.answering) buzzPending = false;
    if (view.answering) buzzPending = false;

    const answeringNow = view.answering || buzzPending;
    if (answeringNow && answerForm.hidden) showAnswerBox();
    answerForm.hidden = !answeringNow;
    buzzButton.hidden = answeringNow;
    buzzButton.disabled = !view.canBuzz;

    // Status line: only rewrite it when the situation changes.
    const key = `${view.puzzleNumber}|${view.phase}|${view.lockedOut}|${view.lastGuess?.playerId ?? ''}|${view.buzzerName ?? ''}`;
    if (key === statusKey) return;
    statusKey = key;

    const guess = view.lastGuess;
    switch (view.phase) {
      case 'intro':
        setStatus(`Get ready! Worth ${view.value.toLocaleString()} points.`);
        break;
      case 'revealing':
        if (view.lockedOut) setStatus("Wrong answer. You're out for this puzzle.", 'bad');
        else if (guess && !guess.correct) setStatus(`${guess.name} got it wrong. Buzz in!`);
        else setStatus('Buzz in when you know it!');
        break;
      case 'buzzed':
        setStatus(view.answering ? 'Your answer:' : `${view.buzzerName} is answering…`);
        break;
      case 'solved':
        setStatus(
          guess?.correct && view.solvedByName
            ? `${view.solvedByName} solved it! ${guess.text.toUpperCase()}`
            : `${view.solvedByName} solved it!`,
          'good',
        );
        break;
      case 'unsolved':
        setStatus('Nobody solved it.');
        break;
      case 'gameEnd':
        setStatus(`Final score: ${view.score.toLocaleString()}. Look at the TV!`, 'good');
        break;
    }
  }

  function tick() {
    if (!view || answerForm.hidden) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.answering ? `${secs}s` : '';
    timerEl.classList.toggle('low', secs <= 5);
  }
  const interval = setInterval(tick, 200);

  answerForm.hidden = true;

  return {
    update(raw) {
      view = raw as TossUpPlayerView;
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
