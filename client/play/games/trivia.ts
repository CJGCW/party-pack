import { ANSWER_STYLES, type TriviaInput, type TriviaPlayerView } from '../../../shared/games/trivia';
import { h } from '../dom';
import type { Controller } from '../main';

export function createTrivia(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TriviaPlayerView | null = null;
  let phaseEndsAt = 0;
  /** Picked locally but not yet confirmed by the server, so the tap feels instant. */
  let pendingPick: number | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const filmEl = h('div', { class: 'tu-category' });
  const questionEl = h('div', { class: 'tv-question' });
  const statusEl = h('div', { class: 'tu-status' });
  const buttons = ANSWER_STYLES.map((style, i) => {
    const btn = h(
      'button',
      { class: 'tv-answer', type: 'button', style: `--answer:${style.color}` },
      h('span', { class: 'tv-shape' }, style.shape),
      h('span', { class: 'tv-text' }),
    );
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (view?.phase !== 'answering' || view.myAnswer !== null || pendingPick !== null) return;
      pendingPick = i;
      send({ type: 'answer', index: i } satisfies TriviaInput);
      render();
    });
    return btn;
  });

  root.append(
    h(
      'div',
      { class: 'tv' },
      h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl),
      filmEl,
      questionEl,
      statusEl,
      h('div', { class: 'tv-answers' }, ...buttons),
    ),
  );

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  function render() {
    if (!view) return;
    headerEl.textContent = `Question ${view.questionNumber}/${view.totalQuestions}`;
    scoreEl.textContent = `${view.score.toLocaleString()} pts`;
    filmEl.textContent = view.film;
    questionEl.textContent = view.question;

    if (view.phase !== 'answering') pendingPick = null;
    const picked = view.myAnswer ?? pendingPick;
    const revealing = view.phase === 'reveal' || view.phase === 'gameEnd';

    buttons.forEach((btn, i) => {
      const answer = view!.answers[i];
      btn.hidden = answer === undefined || view!.phase === 'gameEnd';
      (btn.lastChild as HTMLElement).textContent = answer ?? '';
      btn.classList.toggle('picked', picked === i);
      btn.classList.toggle('dimmed', picked !== null && picked !== i && !revealing);
      btn.classList.toggle('right', revealing && view!.correctIndex === i);
      btn.classList.toggle('wrong', revealing && view!.correctIndex !== i);
      btn.disabled = view!.phase !== 'answering' || picked !== null;
    });

    switch (view.phase) {
      case 'question':
        setStatus('Read the question… answers coming up!');
        break;
      case 'answering':
        setStatus(picked === null ? 'Pick an answer. Faster scores more!' : 'Locked in! Waiting for everyone…');
        break;
      case 'reveal':
        if (view.myAnswer === null) setStatus(`Out of time. It was ${view.answers[view.correctIndex!]}.`, 'bad');
        else if (view.myAnswer === view.correctIndex) setStatus(`Correct! +${view.questionPoints}`, 'good');
        else setStatus(`Wrong. It was ${view.answers[view.correctIndex!]}.`, 'bad');
        break;
      case 'gameEnd':
        setStatus(`Round scores: you got +${view.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
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
      view = raw as TriviaPlayerView;
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
