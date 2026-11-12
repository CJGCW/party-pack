// Moving a Wumble from one spot to another on foot (or wheel, or spring...): it's drawn where it's
// going, then slid there from where it was while cw-walk plays its walk cycle (see style.css).

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pixels a Wumble covers in a second. */
export const WALK_SPEED = 110;

/**
 * Walks `el` (already in its new place) in from `dx`, `dy` pixels back. Resolves when it's there.
 * Moving an SVG piece: pass its inner group, since this sets a CSS transform.
 */
export function walkIn(el: HTMLElement | SVGElement, dx: number, dy: number, ms = (Math.hypot(dx, dy) / WALK_SPEED) * 1000): Promise<void> {
  if (still() || (!dx && !dy)) return Promise.resolve();
  el.classList.add('cw-walk');
  el.style.setProperty('--face', dx < 0 ? '-1' : '1');
  const move = el.animate([{ transform: `translate(${-dx}px, ${-dy}px)` }, { transform: 'translate(0, 0)' }], { duration: Math.max(250, ms), easing: 'linear' });
  return move.finished.then(
    () => el.classList.remove('cw-walk'),
    () => el.classList.remove('cw-walk'),
  );
}
