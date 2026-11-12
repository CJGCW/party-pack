// A storybook scene behind the whole phone screen. A painted picture in public/scenes is used if
// there is one (see docs/scene-prompts.md); otherwise the scene's painted in code (sceneArt.ts).
// The code one's filters are too slow to redraw, so it's drawn to a picture once per size and
// theme. Either way it's dimmed a little so the puzzle stays easy to read, and fireflies twinkle
// over the night scenes on a light layer of their own.

import { paintedSceneSvg, type SceneTheme } from '../../shared/sceneArt';
import { h } from './dom';

const cache = new Map<string, Promise<string>>();

/** Loads a picture; resolves with its URL once it's there, or rejects if it isn't. */
function load(src: string): Promise<string> {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => done(src);
    img.onerror = fail;
    img.src = src;
  });
}

/** The scene as a picture: the painted one if it's there, else drawn in code once per theme and size. */
function scenePicture(
  theme: SceneTheme,
  w: number,
  hgt: number,
): Promise<string> {
  const key = `${theme}|${w}|${hgt}`;
  let pic = cache.get(key);
  if (!pic) {
    pic = load(
      `/scenes/${theme}-${w > hgt ? 'landscape' : 'portrait'}.jpg`,
    ).catch(() => drawn(theme, w, hgt));
    cache.set(key, pic);
  }
  return pic;
}

function drawn(theme: SceneTheme, w: number, hgt: number): Promise<string> {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(hgt * scale);
      canvas
        .getContext('2d')!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      done(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = fail;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(paintedSceneSvg(theme, w, hgt))}`;
  });
}

/** Puts the scene behind the page; returns what takes it away again. */
export function showBackdrop(theme: SceneTheme): () => void {
  // Sized to the screen in steps, so a small resize (a bar showing) doesn't redraw it.
  const step = (n: number) => Math.max(200, Math.round(n / 100) * 100);
  const w = step(window.innerWidth);
  const hgt = step(window.innerHeight);
  let gone = false;
  const body = document.body;
  scenePicture(theme, w, hgt)
    .then((url) => {
      if (gone) return;
      body.classList.add('cw-scene');
      body.style.backgroundImage = `linear-gradient(rgba(20, 15, 46, 0.15), rgba(20, 15, 46, 0.3)), url(${url})`;
    })
    .catch(() => {
      // No scene: the plain background's still there.
    });

  const flies = h('div', { class: 'cw-flies', 'aria-hidden': 'true' });
  if (theme !== 'meadow') {
    for (let i = 0; i < 12; i++) {
      flies.append(
        h('span', {
          style: `left:${(Math.random() * 96).toFixed(1)}%;top:${(15 + Math.random() * 60).toFixed(1)}%;animation-delay:-${(Math.random() * 3).toFixed(2)}s,-${(Math.random() * 7).toFixed(2)}s`,
        }),
      );
    }
  }
  body.append(flies);

  return () => {
    gone = true;
    flies.remove();
    body.classList.remove('cw-scene');
    body.style.backgroundImage = '';
  };
}

/** Each puzzle's scene, so it always looks the same. */
export const PUZZLE_SCENES: Record<string, SceneTheme> = {
  'two-doors': 'glade',
  'seating-chart': 'glade',
  'lens-lab': 'glade',
  'picky-eater': 'meadow',
  'line-up': 'meadow',
  'stepping-stones': 'meadow',
  lookalikes: 'pond',
  'room-sort': 'pond',
  switchback: 'pond',
};
