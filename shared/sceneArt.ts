// Storybook backdrops, painted in code: a scene w by h as an SVG document. Built up like a
// painting, back to front: sky and its glow, hazy far hills and forest, big lit trees framing the
// sides, the ground with a pool of warm light on it, props, dark foreground leaves, then brushy
// texture and a vignette over the lot. Everything comes from a seeded random sequence, so a scene's
// the same every time. The filters are slow: draw it to a picture once, and show that.

export type SceneTheme = 'glade' | 'meadow' | 'pond';
export const SCENE_THEMES: SceneTheme[] = ['glade', 'meadow', 'pond'];

interface Look {
  sky: [string, string, string];
  glow: string;
  orb: string;
  night: boolean;
  /** Far to near: hills, then the forest line. */
  far: string;
  near: string;
  leaf: string;
  trunk: string;
  ground: string;
  path: string;
  /** The light falling on things (lit sides of leaves, the pool on the ground). */
  light: string;
  shade: string;
}

const LOOKS: Record<SceneTheme, Look> = {
  glade: { sky: ['#241a52', '#7a4f8f', '#f4a46a'], glow: '#ffb070', orb: '#fff1c9', night: true, far: '#6a4f8a', near: '#3a4f6a', leaf: '#2f5a4a', trunk: '#4a3340', ground: '#4d7a3e', path: '#c99d63', light: '#ffd28a', shade: '#1a1430' },
  meadow: { sky: ['#5aa6df', '#a9dcf3', '#fff0c4'], glow: '#fff3c0', orb: '#ffd166', night: false, far: '#9fcfa6', near: '#6aa86a', leaf: '#3f8a4a', trunk: '#6e4a30', ground: '#67b04a', path: '#ead39a', light: '#fff4b0', shade: '#24402a' },
  pond: { sky: ['#0b1034', '#1d2a66', '#456aa8'], glow: '#7fa6e8', orb: '#eef3ff', night: true, far: '#2d3f78', near: '#1d3c5a', leaf: '#1d4a4a', trunk: '#2a2a3a', ground: '#2a5a42', path: '#2f6aa0', light: '#a8c8ff', shade: '#0a0f24' },
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** Blends two #rrggbb colours: t = 0 is a, 1 is b. */
function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const f = (n: number) => n.toFixed(1);

/** A soft, lumpy round shape: a circle with a wobbly edge. */
function blob(cx: number, cy: number, r: number, rand: () => number, fill: string, extra = '') {
  const n = 8;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.82 + rand() * 0.3);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9];
  });
  let d = '';
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d += i ? `Q${f(x0)} ${f(y0)} ${f(mx)} ${f(my)}` : `M${f(mx)} ${f(my)}`;
  }
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[1];
  d += `Q${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}Z`;
  return `<path d="${d}" fill="${fill}"${extra}/>`;
}

/** A rolling ridge across the width, filled down to the bottom. */
function ridge(w: number, h: number, base: number, amp: number, bumps: number, rand: () => number, fill: string) {
  const pts = Array.from({ length: bumps + 1 }, (_, i) => [(i / bumps) * w, base + (rand() - 0.5) * 2 * amp]);
  let d = `M0 ${h}L0 ${f(pts[0][1])}`;
  for (let i = 0; i < bumps; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    d += `C${f(mx)} ${f(y0)} ${f(mx)} ${f(y1)} ${f(x1)} ${f(y1)}`;
  }
  return `<path d="${d}L${w} ${h}Z" fill="${fill}"/>`;
}

/** A line of distant treetops: round crowns along a ridge. */
function forestLine(w: number, base: number, size: number, rand: () => number, fill: string, h: number) {
  let s = `<rect x="0" y="${f(base)}" width="${w}" height="${f(h - base)}" fill="${fill}"/>`;
  for (let x = -size; x < w + size; x += size * (0.5 + rand() * 0.5)) s += blob(x, base - rand() * size * 0.5, size * (0.6 + rand() * 0.5), rand, fill);
  return s;
}

/** A big tree: a trunk flaring into roots, and a crown of leaf clumps lit from the upper left. */
function bigTree(x: number, ground: number, s: number, L: Look, rand: () => number) {
  const top = ground - 210 * s;
  const tw = 16 * s;
  const lit = mix(L.leaf, L.light, 0.45);
  const mid = mix(L.leaf, L.light, 0.18);
  const dark = mix(L.leaf, L.shade, 0.45);
  let out =
    `<path d="M${f(x - tw)} ${f(ground)}C${f(x - tw * 2.2)} ${f(ground + 4 * s)} ${f(x - tw * 1.1)} ${f(ground - 20 * s)} ${f(x - tw * 0.7)} ${f(ground - 40 * s)}` +
    `L${f(x - tw * 0.5)} ${f(top + 40 * s)}L${f(x + tw * 0.5)} ${f(top + 40 * s)}L${f(x + tw * 0.7)} ${f(ground - 40 * s)}` +
    `C${f(x + tw * 1.1)} ${f(ground - 20 * s)} ${f(x + tw * 2.4)} ${f(ground + 4 * s)} ${f(x + tw)} ${f(ground)}Z" fill="${L.trunk}"/>` +
    // Bark: a lit edge and a couple of grooves.
    `<path d="M${f(x - tw * 0.45)} ${f(top + 60 * s)}L${f(x - tw * 0.6)} ${f(ground - 30 * s)}" stroke="${mix(L.trunk, L.light, 0.35)}" stroke-width="${f(3 * s)}" stroke-linecap="round" opacity=".7"/>` +
    `<path d="M${f(x + tw * 0.15)} ${f(top + 80 * s)}q${f(-4 * s)} ${f(40 * s)} 0 ${f(80 * s)}" stroke="${mix(L.trunk, L.shade, 0.5)}" stroke-width="${f(2 * s)}" fill="none" stroke-linecap="round"/>`;
  // The crown: dark clumps underneath, mid ones, then lit ones up and to the left.
  for (let i = 0; i < 9; i++) out += blob(x + (rand() - 0.5) * 120 * s, top + (rand() - 0.2) * 60 * s, (34 + rand() * 18) * s, rand, dark);
  for (let i = 0; i < 8; i++) out += blob(x + (rand() - 0.6) * 100 * s, top - 10 * s + (rand() - 0.5) * 50 * s, (28 + rand() * 14) * s, rand, mid);
  for (let i = 0; i < 6; i++) out += blob(x - 25 * s + (rand() - 0.5) * 60 * s, top - 30 * s + (rand() - 0.5) * 30 * s, (16 + rand() * 10) * s, rand, lit);
  return out;
}

function tuft(x: number, y: number, s: number, colour: string, rand: () => number) {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const lean = (rand() - 0.5) * 16 * s;
    const tall = (8 + rand() * 10) * s;
    d += `M${f(x + (i - 2) * 2 * s)} ${f(y)}q${f(lean * 0.3)} ${f(-tall * 0.6)} ${f(lean)} ${f(-tall)}`;
  }
  return `<path d="${d}" stroke="${colour}" stroke-width="${f(1.6 * s)}" fill="none" stroke-linecap="round"/>`;
}

function rock(x: number, y: number, s: number, L: Look, rand: () => number) {
  const base = mix('#7a7488', L.shade, 0.35);
  return (
    `<ellipse cx="${f(x)}" cy="${f(y + 6 * s)}" rx="${f(20 * s)}" ry="${f(5 * s)}" fill="${L.shade}" opacity=".35"/>` +
    blob(x, y - 4 * s, 16 * s, rand, base) +
    blob(x - 5 * s, y - 9 * s, 8 * s, rand, mix(base, L.light, 0.35)) +
    blob(x + 4 * s, y - 15 * s, 6 * s, rand, mix('#4f7a3e', L.light, 0.2))
  );
}

function mushroom(x: number, y: number, s: number, cap: string, L: Look, glow: boolean) {
  return (
    (glow ? `<circle cx="${f(x)}" cy="${f(y - 12 * s)}" r="${f(34 * s)}" fill="url(#bloom)" opacity=".8"/>` : '') +
    `<g transform="translate(${f(x)} ${f(y)}) scale(${s.toFixed(2)})">` +
    `<ellipse cx="0" cy="14" rx="16" ry="4" fill="${L.shade}" opacity=".4"/>` +
    `<path d="M-5 14C-6 4-4-4-4-4H4C4-4 6 4 5 14Z" fill="#f3e6c8"/><path d="M1-4C2 4 4 8 5 14" stroke="#cbb894" stroke-width="2" fill="none"/>` +
    `<path d="M-19-2C-19-26 19-26 19-2C10 1-10 1-19-2Z" fill="${cap}"/>` +
    `<path d="M-14-6C-14-20 4-23 10-18C0-19-10-14-14-6Z" fill="#fff" opacity=".35"/>` +
    `<circle cx="-7" cy="-12" r="3" fill="#fff4dc"/><circle cx="6" cy="-16" r="2.4" fill="#fff4dc"/><circle cx="11" cy="-8" r="1.8" fill="#fff4dc"/></g>`
  );
}

function flower(x: number, y: number, s: number, petal: string) {
  const petals = [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-4.5" rx="2.6" ry="4.5" fill="${petal}" transform="rotate(${a})"/>`).join('');
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s.toFixed(2)})"><path d="M0 2q2 8 0 14" stroke="#3f7a3a" stroke-width="1.6" fill="none"/>${petals}<circle r="2.2" fill="#ffcf4d"/></g>`;
}

function reed(x: number, y: number, s: number) {
  return (
    `<g transform="translate(${f(x)} ${f(y)}) scale(${s.toFixed(2)})"><path d="M0 0Q-3-26 3-58" fill="none" stroke="#2f5a3a" stroke-width="2.4"/>` +
    `<rect x="-1.5" y="-54" width="6" height="16" rx="3" fill="#6b4630" transform="rotate(5 1 -46)"/>` +
    `<path d="M0 0Q8-16 18-30M0 0Q-8-14-16-22" fill="none" stroke="#3a6a44" stroke-width="2"/></g>`
  );
}

/** Dark leaves crowding in from a bottom corner, to frame the picture. */
function fern(x: number, y: number, s: number, flip: number, colour: string) {
  let out = `<g transform="translate(${f(x)} ${f(y)}) scale(${(flip * s).toFixed(2)} ${s.toFixed(2)})">`;
  for (let i = 0; i < 6; i++) {
    const a = -80 + i * 14;
    out += `<path d="M0 0Q20-30 ${f(70 + i * 8)} -${f(40 + i * 6)}Q30-14 0 0Z" fill="${colour}" transform="rotate(${a + 60})"/>`;
  }
  return `${out}</g>`;
}

/** A branch hanging in from a top corner, with leaf clumps. */
function overhang(x: number, s: number, flip: number, L: Look, rand: () => number) {
  const dark = mix(L.leaf, L.shade, 0.7);
  let out = `<g transform="translate(${f(x)} 0) scale(${(flip * s).toFixed(2)} ${s.toFixed(2)})">`;
  out += `<path d="M-10 10C40 20 80 40 140 30" stroke="${mix(L.trunk, L.shade, 0.5)}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 9; i++) out += blob(rand() * 150, 10 + rand() * 50, 16 + rand() * 14, rand, dark);
  return `${out}</g>`;
}

/** The whole scene as an SVG document, w by h. */
export function paintedSceneSvg(theme: SceneTheme, w: number, h: number) {
  const L = LOOKS[theme];
  const rand = rng(theme.charCodeAt(0) * 7919 + theme.length);
  const u = Math.min(w, h) / 400;
  const wide = w > h;
  const horizon = h * (wide ? 0.42 : 0.36);
  const ground = h * (wide ? 0.62 : 0.56);
  const orbX = w * 0.74;
  const orbY = h * 0.11;
  const out: string[] = [];
  const skyBottom = L.sky[2];

  // Sky, its warm glow at the horizon, the sun or moon, and stars or clouds.
  out.push(`<rect width="${w}" height="${h}" fill="url(#sky)"/>`);
  out.push(`<ellipse cx="${w / 2}" cy="${f(horizon + 20 * u)}" rx="${f(w * 0.9)}" ry="${f(110 * u)}" fill="url(#glow)"/>`);
  out.push(`<circle cx="${f(orbX)}" cy="${f(orbY)}" r="${f(90 * u)}" fill="url(#halo)"/>`);
  out.push(`<circle cx="${f(orbX)}" cy="${f(orbY)}" r="${f(26 * u)}" fill="${L.orb}"/>`);
  if (L.night) {
    out.push(`<circle cx="${f(orbX - 8 * u)}" cy="${f(orbY - 6 * u)}" r="${f(5 * u)}" fill="${mix(L.orb, '#c8c0a0', 0.4)}" opacity=".5"/><circle cx="${f(orbX + 9 * u)}" cy="${f(orbY + 7 * u)}" r="${f(3.5 * u)}" fill="${mix(L.orb, '#c8c0a0', 0.4)}" opacity=".5"/>`);
    for (let i = 0; i < (theme === 'pond' ? 70 : 35); i++) out.push(`<circle cx="${f(rand() * w)}" cy="${f(rand() * horizon * 0.85)}" r="${f((0.5 + rand() * 1.1) * u)}" fill="#fff" opacity="${(0.25 + rand() * 0.7).toFixed(2)}"/>`);
  } else {
    for (let i = 0; i < 4; i++) {
      const cx = w * (0.08 + i * 0.27 + rand() * 0.08);
      const cy = h * (0.06 + rand() * 0.16);
      let cloud = `<g opacity=".92">`;
      for (let j = 0; j < 6; j++) cloud += blob(cx + (j - 2.5) * 16 * u, cy - Math.sin((j / 5) * Math.PI) * 12 * u, (14 + rand() * 8) * u, rand, j % 2 ? '#ffffff' : '#f4f8ff');
      cloud += `<ellipse cx="${f(cx)}" cy="${f(cy + 8 * u)}" rx="${f(52 * u)}" ry="${f(8 * u)}" fill="${mix('#ffffff', L.sky[1], 0.4)}"/></g>`;
      out.push(cloud);
    }
  }

  // Far hills fading into the haze, then a line of distant forest.
  for (let i = 0; i < 3; i++) {
    const c = mix(L.far, skyBottom, 0.55 - i * 0.2);
    out.push(ridge(w, h, horizon + i * 22 * u, 26 * u, 5 + i, rand, c));
  }
  out.push(`<rect y="${f(horizon - 10 * u)}" width="${w}" height="${f(90 * u)}" fill="url(#haze)"/>`);
  out.push(forestLine(w, ground - 34 * u, 26 * u, rand, mix(L.near, skyBottom, 0.25), h));
  out.push(forestLine(w, ground - 14 * u, 22 * u, rand, L.near, h));

  // The ground, lighter far off, and a pool of light where the puzzle happens.
  out.push(ridge(w, h, ground, 6 * u, 6, rand, 'url(#ground)'));
  out.push(`<ellipse cx="${w / 2}" cy="${f(ground + (h - ground) * 0.45)}" rx="${f(w * 0.48)}" ry="${f((h - ground) * 0.42)}" fill="url(#pool)"/>`);

  if (theme === 'pond') {
    const cx = w / 2;
    const cy = ground + (h - ground) * 0.48;
    const rx = w * 0.4;
    const ry = (h - ground) * 0.28;
    out.push(`<ellipse cx="${f(cx)}" cy="${f(cy + 4 * u)}" rx="${f(rx + 8 * u)}" ry="${f(ry + 6 * u)}" fill="${mix(L.ground, L.shade, 0.5)}"/>`);
    out.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#water)"/>`);
    for (let i = 0; i < 5; i++) out.push(`<path d="M${f(cx - rx * (0.15 + i * 0.05))} ${f(cy - ry * 0.4 + i * 7 * u)}h${f(rx * (0.3 + (i % 2) * 0.12))}" stroke="${L.orb}" stroke-width="${f(1.6 * u)}" stroke-linecap="round" opacity="${(0.45 - i * 0.07).toFixed(2)}"/>`);
    for (let i = 0; i < 6; i++) {
      const px = cx + (rand() - 0.5) * rx * 1.5;
      const py = cy + (rand() - 0.3) * ry;
      out.push(`<path d="M${f(px)} ${f(py)}m${f(-10 * u)} 0a${f(10 * u)} ${f(4 * u)} 0 1 0 ${f(20 * u)} 0l${f(-10 * u)} ${f(-1 * u)}z" fill="#3f7a4a"/>`);
      if (i % 3 === 0) out.push(flower(px + 3 * u, py - 4 * u, u * 0.7, '#ffd0e4'));
    }
    for (let i = 0; i < 14; i++) {
      const left = rand() < 0.5;
      out.push(reed(left ? rand() * w * 0.22 : w - rand() * w * 0.22, ground + (12 + rand() * 60) * u, u * (0.8 + rand() * 0.6)));
    }
  } else {
    // A winding path, darker at its edges, with pebbles.
    const mid = h - (h - ground) * 0.5;
    const pathD = `M${f(w * 0.12)} ${h}C${f(w * 0.3)} ${f(mid)} ${f(w * 0.43)} ${f(ground + 24 * u)} ${f(w * 0.5)} ${f(ground + 6 * u)}C${f(w * 0.57)} ${f(ground + 24 * u)} ${f(w * 0.7)} ${f(mid)} ${f(w * 0.88)} ${h}Z`;
    out.push(`<path d="${pathD}" fill="${mix(L.path, L.shade, 0.35)}" transform="translate(0 ${f(3 * u)})"/>`);
    out.push(`<path d="${pathD}" fill="url(#path)"/>`);
    for (let i = 0; i < 18; i++) {
      const t = rand();
      const y = ground + 20 * u + t * (h - ground);
      const half = (w * 0.05 + t * w * 0.3) * (rand() - 0.5) * 1.6;
      out.push(`<ellipse cx="${f(w / 2 + half)}" cy="${f(y)}" rx="${f((2 + rand() * 3) * u)}" ry="${f((1.2 + rand() * 1.5) * u)}" fill="${mix(L.path, L.shade, 0.25 + rand() * 0.2)}"/>`);
    }
  }

  // Big trees framing each side, behind the props.
  out.push(bigTree(w * 0.06, ground + 30 * u, 1.15 * u, L, rand));
  out.push(bigTree(w * 0.95, ground + 22 * u, 1.05 * u, L, rand));
  if (wide) out.push(bigTree(w * 0.2, ground + 10 * u, 0.75 * u, L, rand), bigTree(w * 0.82, ground + 6 * u, 0.7 * u, L, rand));

  // Grass, rocks, and each scene's own things.
  const grass = [mix(L.ground, L.light, 0.35), mix(L.ground, L.shade, 0.3), mix(L.ground, L.light, 0.15)];
  for (let i = 0; i < 60; i++) {
    const y = ground + 10 * u + rand() * (h - ground);
    const x = rand() * w;
    if (Math.abs(x - w / 2) < w * (0.06 + ((y - ground) / (h - ground)) * 0.3)) continue; // Not on the path.
    out.push(tuft(x, y, u * (0.7 + ((y - ground) / (h - ground)) * 0.8), grass[i % 3], rand));
  }
  out.push(rock(w * 0.2, ground + 60 * u, 1.1 * u, L, rand), rock(w * 0.84, ground + 90 * u, 0.9 * u, L, rand));
  if (theme === 'glade') {
    out.push(mushroom(w * 0.13, ground + 110 * u, 1.3 * u, '#d9434c', L, true));
    out.push(mushroom(w * 0.22, ground + 130 * u, 0.8 * u, '#e8a83a', L, true));
    out.push(mushroom(w * 0.86, ground + 150 * u, 1.1 * u, '#9a6ad8', L, true));
  } else if (theme === 'meadow') {
    const petals = ['#ff6f86', '#ffffff', '#b48cff', '#ffa34a', '#ffd84d'];
    for (let i = 0; i < 40; i++) {
      const y = ground + 15 * u + rand() * (h - ground) * 0.9;
      const x = rand() < 0.5 ? rand() * w * 0.3 : w - rand() * w * 0.3;
      out.push(flower(x, y, u * (0.55 + ((y - ground) / (h - ground)) * 0.8), petals[i % petals.length]));
    }
  }

  // Dark leaves framing the corners, sunbeams or moonbeams, then texture and a vignette.
  const frame = mix(L.leaf, L.shade, 0.75);
  out.push(fern(-10 * u, h + 10 * u, 1.4 * u, 1, frame), fern(w + 10 * u, h + 10 * u, 1.3 * u, -1, frame));
  out.push(overhang(-20 * u, 1.3 * u, 1, L, rand), overhang(w + 20 * u, 1.1 * u, -1, L, rand));
  let beams = `<g filter="url(#soft)" opacity="${L.night ? 0.12 : 0.22}">`;
  for (let i = 0; i < 4; i++) {
    const a = 0.55 + i * 0.18;
    const len = h * 0.9;
    beams += `<path d="M${f(orbX)} ${f(orbY)}L${f(orbX - Math.sin(a) * len - 30 * u)} ${f(orbY + Math.cos(a) * len)}L${f(orbX - Math.sin(a) * len + 30 * u)} ${f(orbY + Math.cos(a) * len)}Z" fill="${L.light}"/>`;
  }
  out.push(`${beams}</g>`);
  out.push(`<rect width="${w}" height="${h}" filter="url(#brush)" opacity=".5" style="mix-blend-mode:soft-light"/>`);
  out.push(`<rect width="${w}" height="${h}" filter="url(#canvas)" opacity=".14" style="mix-blend-mode:overlay"/>`);
  out.push(`<rect width="${w}" height="${h}" fill="url(#vignette)"/>`);

  const defs =
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.sky[0]}"/><stop offset="${((horizon / h) * 0.6).toFixed(2)}" stop-color="${L.sky[1]}"/><stop offset="${(horizon / h + 0.06).toFixed(2)}" stop-color="${L.sky[2]}"/></linearGradient>` +
    `<radialGradient id="glow"><stop offset="0" stop-color="${L.glow}" stop-opacity=".75"/><stop offset="1" stop-color="${L.glow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="halo"><stop offset="0" stop-color="${L.orb}" stop-opacity=".6"/><stop offset=".4" stop-color="${L.orb}" stop-opacity=".18"/><stop offset="1" stop-color="${L.orb}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyBottom}" stop-opacity="0"/><stop offset=".5" stop-color="${skyBottom}" stop-opacity=".35"/><stop offset="1" stop-color="${skyBottom}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(L.ground, skyBottom, 0.25)}"/><stop offset="1" stop-color="${mix(L.ground, L.shade, 0.35)}"/></linearGradient>` +
    `<radialGradient id="pool"><stop offset="0" stop-color="${L.light}" stop-opacity="${L.night ? 0.45 : 0.35}"/><stop offset="1" stop-color="${L.light}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(L.path, skyBottom, 0.2)}"/><stop offset="1" stop-color="${mix(L.path, L.light, 0.15)}"/></linearGradient>` +
    `<radialGradient id="water" cx=".5" cy=".35"><stop offset="0" stop-color="${mix(L.path, L.orb, 0.35)}"/><stop offset=".7" stop-color="${L.path}"/><stop offset="1" stop-color="${mix(L.path, L.shade, 0.4)}"/></radialGradient>` +
    `<radialGradient id="bloom"><stop offset="0" stop-color="${L.light}" stop-opacity=".5"/><stop offset="1" stop-color="${L.light}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="vignette" cx=".5" cy=".55" r=".75"><stop offset=".55" stop-color="${L.shade}" stop-opacity="0"/><stop offset="1" stop-color="${L.shade}" stop-opacity=".7"/></radialGradient>` +
    `<filter id="soft"><feGaussianBlur stdDeviation="${f(8 * u)}"/></filter>` +
    // Long streaky noise, grey: brushstrokes over everything.
    `<filter id="brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${(0.006 / u).toFixed(4)} ${(0.045 / u).toFixed(4)}" numOctaves="4" seed="11"/><feColorMatrix type="saturate" values="0"/></filter>` +
    `<filter id="canvas" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="3"/><feColorMatrix type="saturate" values="0"/></filter>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${out.join('')}</svg>`;
}
