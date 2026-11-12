// The Wumble art gallery (client/gallery.html, at /gallery.html, linked from nowhere): every Wumble
// trait idling, each kind of feet walking, the backdrops, and buttons for the cheer and head-shake
// animations.
import { wumble } from '../../shared/critters';
import { SCENE_THEMES, type SceneTheme } from '../../shared/sceneArt';
import { showBackdrop } from './backdrop';
import { grid, pieceIcon, tile } from './critterScreen';
import { walkIn } from './walk';
import { h } from './dom';

const app = document.getElementById('app')!;
const stage = h('div', { class: 'cr-stage' });
let picked = 7;

function render() {
  const rows = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => [c, (c + r) % 5, (c + 2 * r) % 5, (c + 3 * r) % 5]));
  const all = rows.flat().map((t, i) => tile(wumble(t), { on: i === picked, click: () => ((picked = i), render()) }));
  const plain = [0, 1, 2, 3].map((trait) => {
    const t = [-1, -1, -1, -1];
    t[trait] = 2;
    return tile(wumble(t));
  });
  stage.replaceChildren(h('div', { class: 'sp-label' }, 'Every trait (tap to pick)'), grid(5, ...all), h('div', { class: 'sp-label' }, 'Clue chips'), grid(6, ...plain));
}

const mood = (kind: string) => {
  stage.classList.remove('cw-cheer', 'cw-oops');
  void stage.offsetWidth;
  stage.classList.add(kind);
  setTimeout(() => stage.classList.remove(kind), 700);
};
const btn = (label: string, kind: string) => {
  const b = h('button', { type: 'button', class: 'cr-go secondary' }, label);
  b.addEventListener('click', () => mood(kind));
  return b;
};
// The backdrops: a button for each.
let hideScene = showBackdrop('glade');
const sceneBtn = (theme: SceneTheme) => {
  const b = h('button', { type: 'button', class: 'cr-go secondary' }, theme);
  b.addEventListener('click', () => {
    hideScene();
    hideScene = showBackdrop(theme);
  });
  return b;
};

// A parade: one Wumble with each kind of feet (and none), walking back and forth.
const parade = h('div', { class: 'cw-parade' });
const FEET = [0, 1, 2, 3, 4, -1];
FEET.forEach((feet, i) => {
  const walker = h('div', { class: 'cw-walker', style: `top:${i * 44}px` });
  walker.append(pieceIcon(wumble([i % 5, (i + 2) % 5, (i + 1) % 5, feet])));
  parade.append(walker);
  let x = 0;
  const step = async () => {
    const room = parade.clientWidth - walker.offsetWidth;
    const next = x > room / 2 ? 0 : room;
    walker.style.left = `${next}px`;
    await walkIn(walker, next - x, 0);
    x = next;
    setTimeout(step, 500 + i * 120);
  };
  setTimeout(step, i * 300);
});

app.append(
  h(
    'div',
    { class: 'ra cr' },
    h('div', { class: 'cr-buttons' }, btn('Cheer', 'cw-cheer'), btn('Head shake', 'cw-oops')),
    h('div', { class: 'cr-buttons cw-scenes' }, ...SCENE_THEMES.map(sceneBtn)),
    h('div', { class: 'sp-label' }, 'Walking'),
    parade,
    stage,
  ),
);
render();
