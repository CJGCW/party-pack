import { ANSWER_LETTERS, MAX_LIVES, type TriviaInput, type TriviaPlayerView } from '../../../shared/games/trivia';
import { h } from '../dom';
import type { Controller } from '../main';

export function createTrivia(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TriviaPlayerView | null = null;
  let phaseEndsAt = 0;
  /** Answers toggled on for a select-all question, before locking in. */
  let selected = new Set<number>();
  /** Sent but not yet confirmed by the server, so taps feel instant. */
  let pendingLock: number[] | null = null;
  let questionKey = '';

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const filmEl = h('div', { class: 'tu-category' });
  /** Team Trivia: your lives, the stage, and the team's progress through it. */
  const livesEl = h('span', { class: 'tt-lives' });
  const stageEl = h('span', { class: 'tt-stage' });
  const progressEl = h('div', { class: 'tt-progress' });
  const teamEl = h('div', { class: 'tt-bar' }, h('div', { class: 'tt-row' }, livesEl, stageEl), progressEl);
  const questionEl = h('div', { class: 'tv-question' });
  const multiEl = h('div', { class: 'tv-multi' }, 'Select all that apply');
  const statusEl = h('div', { class: 'tu-status' });

  const lockIn = (indices: number[]) => {
    pendingLock = indices;
    send({ type: 'answer', indices } satisfies TriviaInput);
    render();
  };

  const buttons = ANSWER_LETTERS.map((letter, i) => {
    const btn = h(
      'button',
      { class: 'tv-answer', type: 'button' },
      h('span', { class: 'tv-badge' }, letter),
      h('span', { class: 'tv-text' }),
    );
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!canAnswer()) return;
      if (view!.multi) {
        // Toggle; the Lock in button sends the set.
        if (selected.has(i)) selected.delete(i);
        else selected.add(i);
        render();
      } else {
        lockIn([i]);
      }
    });
    return btn;
  });

  const lockButton = h('button', { class: 'tv-lock', type: 'button' }, 'Lock in');
  lockButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (canAnswer() && selected.size > 0) lockIn([...selected].sort());
  });

  root.append(
    h(
      'div',
      { class: 'tv' },
      h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl),
      teamEl,
      filmEl,
      questionEl,
      multiEl,
      statusEl,
      h('div', { class: 'tv-answers' }, ...buttons, lockButton),
    ),
  );

  function locked(): number[] {
    if (view && view.myAnswers.length > 0) return view.myAnswers;
    return pendingLock ?? [];
  }

  function canAnswer() {
    return view?.phase === 'answering' && locked().length === 0;
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  function listAnswers(indices: number[]) {
    return indices.map((i) => view!.answers[i]).join(', ');
  }

  function render() {
    if (!view) return;
    // Fresh question: forget the last one's selections.
    const key = `${view.questionNumber}|${view.question}`;
    if (key !== questionKey) {
      questionKey = key;
      selected = new Set();
      pendingLock = null;
    }

    headerEl.textContent = view.totalQuestions > 0 ? `Question ${view.questionNumber}/${view.totalQuestions}` : `Question ${view.questionNumber}`;
    const team = view.team;
    teamEl.hidden = !team;
    if (team) {
      const lives = view.lives ?? MAX_LIVES;
      livesEl.replaceChildren(
        ...Array.from({ length: MAX_LIVES }, (_, k) => h('span', { class: `tt-life${k < lives ? ' on' : ''}` })),
        ...(lives === 0 ? [h('span', { class: 'tt-out' }, 'Out')] : []),
      );
      const st = team.stage;
      stageEl.textContent = `${st.final ? 'Final stage' : `Stage ${st.number}/${st.total}`} · ${st.correct}/${st.needed}`;
      progressEl.replaceChildren(...Array.from({ length: st.needed }, (_, k) => h('span', { class: `tt-seg${k < st.correct ? ' on' : ''}` })));
    }
    scoreEl.textContent = `${view.score.toLocaleString()} pts`;
    filmEl.textContent = view.film;
    questionEl.textContent = view.question;
    multiEl.hidden = !view.multi || view.phase === 'gameEnd';

    const mine = locked();
    const revealing = view.phase === 'reveal' || view.phase === 'gameEnd';
    const correct = view.correctIndices ?? [];
    // What to highlight as "picked": the locked-in answers, or the current toggles.
    const picked = mine.length > 0 ? mine : [...selected];

    buttons.forEach((btn, i) => {
      const answer = view!.answers[i];
      btn.hidden = answer === undefined || view!.phase === 'gameEnd';
      (btn.lastChild as HTMLElement).textContent = answer ?? '';
      btn.classList.toggle('picked', picked.includes(i));
      btn.classList.toggle('dimmed', mine.length > 0 && !mine.includes(i) && !revealing);
      btn.classList.toggle('right', revealing && correct.includes(i));
      btn.classList.toggle('wrong', revealing && !correct.includes(i));
      btn.disabled = !canAnswer();
    });
    lockButton.hidden = !view.multi || view.phase !== 'answering' || mine.length > 0;
    lockButton.disabled = selected.size === 0;

    if (team && teamStatus(view, correct)) return;

    switch (view.phase) {
      case 'question':
        setStatus('Read the question… answers coming up!');
        break;
      case 'answering':
        if (mine.length > 0) setStatus('Locked in! Waiting for everyone…');
        else if (view.multi) setStatus('Tap every right answer, then lock in. Faster scores more!');
        else setStatus('Pick an answer. Faster scores more!');
        break;
      case 'reveal': {
        const answerText = view.multi ? `The answers were ${listAnswers(correct)}.` : `It was ${listAnswers(correct)}.`;
        if (view.myAnswers.length === 0) setStatus(`Out of time. ${answerText}`, 'bad');
        else if (view.questionPoints === 0) setStatus(`Wrong. ${answerText}`, 'bad');
        else if (view.multi && !sameSet(view.myAnswers, correct)) setStatus(`Partly right! +${view.questionPoints}. ${answerText}`, 'good');
        else setStatus(`Correct! +${view.questionPoints}`, 'good');
        break;
      }
      case 'gameEnd':
        setStatus(`Round scores: you got +${view.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
  }

  /** Team Trivia messages; returns false to fall back to the usual ones. */
  function teamStatus(v: TriviaPlayerView, correct: number[]): boolean {
    const team = v.team!;
    const answerText = v.multi ? `The answers were ${listAnswers(correct)}.` : `It was ${listAnswers(correct)}.`;
    const out = (v.lives ?? MAX_LIVES) === 0;
    if (v.phase === 'question' || v.phase === 'answering') {
      if (locked().length > 0 || v.phase === 'question') return false;
      // Speed doesn't change Team Trivia's points, so no "faster scores more".
      if (out) setStatus("You're out. Answer right to get back in.", 'bad');
      else setStatus(v.multi ? 'Tap every right answer, then lock in.' : 'Pick an answer.');
      return true;
    }
    if (v.phase === 'gameEnd') {
      if (team.outcome === 'complete') setStatus(`Challenge complete. +${v.gamePoints.toLocaleString()} this round`, 'good');
      else setStatus(`Challenge failed. +${v.gamePoints.toLocaleString()} this round`, 'bad');
      return true;
    }
    const cleared = team.clearedNow ? ' Stage cleared.' : '';
    switch (v.teamResult) {
      case 'correct':
        setStatus(`Correct. +${v.questionPoints}.${cleared}`, 'good');
        break;
      case 'partial':
        setStatus(`Partly right: doesn't count, no life lost. ${answerText}${cleared}`);
        break;
      case 'wrong':
        setStatus(`${out ? "Wrong, and that was your last life: you're out." : 'Wrong: −1 life.'} ${answerText}${cleared}`, 'bad');
        break;
      case 'back':
        setStatus(`Correct: you're back in with 1 life.${cleared}`, 'good');
        break;
      default:
        setStatus(`Still out. ${answerText}${cleared}`, 'bad');
    }
    return true;
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

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}
