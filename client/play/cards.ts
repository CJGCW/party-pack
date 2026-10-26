import { SUIT_SYMBOLS, cardId, cardName, isFaceCard, isJoker, isRed, type Card } from '../../shared/cards';
import { h } from './dom';

export interface CardElementOptions {
  /** Raised and outlined, e.g. picked to play. */
  selected?: boolean;
  /** Greyed out, e.g. can't be played right now. */
  disabled?: boolean;
}

/**
 * One playing card for the phone; `null` draws the back. The card's id is on `data-id`, so a
 * game can listen for taps on its container. Size it with --card-w on any parent (default 64px).
 */
export function cardElement(card: Card | null, { selected = false, disabled = false }: CardElementOptions = {}): HTMLElement {
  if (!card) return h('div', { class: 'pcard back', 'aria-label': 'Face-down card' });
  const cls = ['pcard', isRed(card) ? 'red' : 'black'];
  if (selected) cls.push('selected');
  if (disabled) cls.push('disabled');
  const el = h('div', { class: cls.join(' '), 'aria-label': cardName(card) });
  el.dataset.id = cardId(card);

  if (isJoker(card)) {
    el.append(h('span', { class: 'pcard-corner' }, '★'), h('span', { class: 'pcard-joker' }, 'JOKER'), h('span', { class: 'pcard-corner end' }, '★'));
    return el;
  }
  const suit = SUIT_SYMBOLS[card.suit];
  const corner = (end: boolean) => h('span', { class: `pcard-corner${end ? ' end' : ''}` }, h('b', {}, card.rank), suit);
  // Face cards show their letter big; the others one big suit.
  const middle = isFaceCard(card) ? h('span', { class: 'pcard-face' }, card.rank, h('small', {}, suit)) : h('span', { class: 'pcard-pip' }, suit);
  el.append(corner(false), middle, corner(true));
  return el;
}

/** A row of cards that overlap to fit, e.g. a player's hand. `selected` and `disabled` are card ids. */
export function handElement(cards: readonly Card[], { selected = [], disabled = [] }: { selected?: string[]; disabled?: string[] } = {}) {
  return h(
    'div',
    { class: 'pcard-hand' },
    ...cards.map((c) => cardElement(c, { selected: selected.includes(cardId(c)), disabled: disabled.includes(cardId(c)) })),
  );
}
