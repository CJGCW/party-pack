// The "I give up" button, pinned to the bottom in trivia and word games: hold it down and it
// fills up; let go early and it drains away, hold it to the end and you've given up on the
// puzzle (or turn). It's shown whenever the game's view says giving up is allowed (GiveUpView),
// so the games' own screens don't need to know about it.

import type { GiveUpView } from '../../shared/protocol';
import { h } from './dom';

/** How long to hold it down. */
export const GIVE_UP_HOLD_MS = 1_500;

export function createGiveUpBar(onGiveUp: () => void) {
  const label = h('span', { class: 'give-up-label' }, 'Hold to give up');
  const button = h('button', { type: 'button', class: 'give-up', style: `--hold-ms:${GIVE_UP_HOLD_MS}ms` }, label) as HTMLButtonElement;
  const note = h('div', { class: 'give-up-note' }, 'You gave up. Waiting for everyone else…');
  const bar = h('div', { class: 'give-up-bar', hidden: true }, button, note);
  document.body.append(bar);

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Sent, waiting for the server's next view. */
  let sent = false;

  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (sent) return;
    button.classList.remove('holding');
    label.textContent = 'Hold to give up';
  };

  button.addEventListener('pointerdown', (e) => {
    if (sent || timer) return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    button.classList.add('holding');
    label.textContent = 'Keep holding…';
    timer = setTimeout(() => {
      timer = null;
      sent = true;
      label.textContent = 'Giving up…';
      navigator.vibrate?.(40);
      onGiveUp();
    }, GIVE_UP_HOLD_MS);
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  // A long press would otherwise bring up the phone's text-selection or context menu.
  button.addEventListener('contextmenu', (e) => e.preventDefault());

  /** Shows the button, the "you gave up" note, or neither, for a game's latest player view. */
  function update(view: GiveUpView | null) {
    const can = !!view?.canGiveUp;
    const gaveUp = !!view?.gaveUp;
    // Views arrive all the time (a letter dropping, someone else guessing): a hold in progress
    // carries on through them, unless giving up is no longer allowed.
    if (sent || !can) {
      sent = false;
      release();
    }
    button.hidden = !can;
    note.hidden = !gaveUp || can;
    bar.hidden = !can && !gaveUp;
    document.body.classList.toggle('has-give-up', !bar.hidden);
    document.body.classList.toggle('gave-up', gaveUp && !can);
  }

  return { update };
}
