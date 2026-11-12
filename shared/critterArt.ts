import { PAINTS, type Traits } from './critters';

// The storybook look for Wumbles: smooth shapes, soft shading, rosy cheeks and a smile, written as
// SVG markup so the phones and the TV draw the same thing. Each part sits in its own group with a
// class, so it can move on its own (see the cw- rules in the phone's stylesheet):
//   cw-hop   the whole Wumble: hops and shakes
//   cw-bob   bobs gently while idle
//   cw-hat   wobbles
//   cw-eyes  blinks
//   cw-spin / cw-boing   wheels turn, springs squash
//   cw-top   everything above the feet, which rides up and down on springs
//   cw-feet cw-f{n} > cw-foot   each foot, so a hop moves them to suit (flippers flap, springs squash on landing…)

const INK = '#2a1f3d';
const CREAM = '#fff4d6';
/** Each paint's dark underside and light highlight, for its shading. */
const DARK = ['#b8364d', '#c99528', '#2a8f50', '#2f88b3', '#7a52cc', '#5d5788'];
const LIGHT = ['#ffb3bf', '#fff0b8', '#b9f5cc', '#c6efff', '#e3d4ff', '#c9c4e6'];
const GREY = '#8d86b8';

/** How long each idle animation takes to come round, in seconds (the stylesheet uses the same). */
export const PERIODS = { bob: 2.4, hat: 3, eyes: 4.5, spin: 1.6, boing: 1.2 } as const;

/** The shading for each paint (and grey, for a Wumble with no colour), once per page or picture. */
export function artDefs() {
  return [...PAINTS, GREY]
    .map(
      (c, i) =>
        `<radialGradient id="cw-g${i}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${LIGHT[i]}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${DARK[i]}"/></radialGradient>`,
    )
    .join('');
}

const ink = (w = 2.5) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function feet(i: number) {
  // Each foot in its own group, pivoting at the ankle, so a hop can flap, kick or splay them (--dir: -1 left, 1 right).
  const both = (draw: (x: number) => string) => [-11, 11].map((x) => `<g class="cw-foot" style="--dir:${Math.sign(x)}">${draw(x)}</g>`).join('');
  switch (i) {
    case 0: // Boots
      return both((x) => `<path transform="translate(${x} 0)${x < 0 ? ' scale(-1 1)' : ''}" d="M-6 32h12v8q9 0 9 6v3h-21z" fill="#9a5a34" ${ink()}/>`);
    case 1: // Wheels
      return both((x) => `<g class="cw-spin"><circle cx="${x}" cy="43" r="8" fill="${CREAM}" ${ink()}/><path d="M${x - 6} 43h12M${x} 37v12" fill="none" ${ink(2)}/></g>`);
    case 2: // Springs
      return both((x) => `<g class="cw-boing"><path d="M${x} 32l-6 3 12 4-12 4 12 4-6 3" fill="none" stroke="#c9ccd8" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="${x}" cy="51" rx="6" ry="2.5" fill="#6b6f88" ${ink(1.5)}/></g>`);
    case 3: // Flippers
      return both((x) => `<path d="M${x - 3} 32h6q14 12 9 18q-6-3-12 0q-6-3-12 0q-5-6 9-18z" fill="#ff9f43" ${ink()}/>`);
    case 4: // Stilts
      return both((x) => `<path d="M${x} 32v20" stroke="#8a5a34" stroke-width="4.5" stroke-linecap="round"/><path d="M${x - 5} 53h10" fill="none" ${ink(3)}/>`);
    default: // None: plain little legs
      return both((x) => `<path d="M${x} 32v14" stroke="${GREY}" stroke-width="4" stroke-linecap="round"/>`);
  }
}

function hat(i: number) {
  switch (i) {
    case 0: // Party hat
      return `<path d="M-13-21Q0-24 13-21L3-50Q0-52-3-50Z" fill="#5ec8f2" ${ink()}/><path d="M-9-31Q0-33 9-31M-6-40Q0-42 6-40" fill="none" stroke="#fff" stroke-width="3"/><circle cx="0" cy="-51" r="4.5" fill="#ff5d73" ${ink(2)}/>`;
    case 1: // Crown
      return `<path d="M-16-20-18-40-8-30 0-45 8-30 18-40 16-20Q0-24-16-20Z" fill="#ffcc4d" ${ink()}/><circle cx="0" cy="-27" r="3" fill="#e5484d"/><circle cx="-10" cy="-25" r="2" fill="#5ec8f2"/><circle cx="10" cy="-25" r="2" fill="#5ec8f2"/>`;
    case 2: // Antenna
      return `<path d="M0-24Q-6-36 3-46" fill="none" ${ink(3)}/><circle cx="3" cy="-47" r="6" fill="#fff36b" ${ink(2)}/><circle cx="1" cy="-49" r="2" fill="#fff"/>`;
    case 3: // Top hat
      return `<ellipse cx="0" cy="-22" rx="20" ry="4.5" fill="#3a2f5c" ${ink()}/><path d="M-12-22-11-46Q0-49 11-46L12-22Z" fill="#3a2f5c" ${ink()}/><path d="M-11.5-29h23" stroke="#ff5d73" stroke-width="4"/>`;
    case 4: // Horns
      return `<path d="M-15-18Q-26-26-22-42Q-17-30-8-23Z" fill="${CREAM}" ${ink()}/><path d="M15-18Q26-26 22-42Q17-30 8-23Z" fill="${CREAM}" ${ink()}/>`;
    default:
      return '';
  }
}

function eyes(i: number) {
  const eye = (x: number, y: number, rx: number, ry: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" ${ink(2)}/><circle cx="${x + rx * 0.15}" cy="${y + ry * 0.2}" r="${rx * 0.5}" fill="${INK}"/><circle cx="${x + rx * 0.3}" cy="${y - ry * 0.05}" r="${rx * 0.18}" fill="#fff"/>`;
  switch (i) {
    case 0: // Two
      return eye(-9, -2, 6, 7.5) + eye(9, -2, 6, 7.5);
    case 1: // One big one
      return eye(0, -3, 11, 12);
    case 2: // Three
      return eye(-13, 1, 5, 5.5) + eye(0, -6, 5, 5.5) + eye(13, 1, 5, 5.5);
    case 3: // Sleepy
      return `<path d="M-16-1Q-9 5-3-1M3-1Q9 5 16-1" fill="none" ${ink(3)}/><path d="M-15 1l-3 3M16 1l3 3" fill="none" ${ink(2)}/>`;
    case 4: // Shades
      return `<path d="M-21-6Q0-9 21-6L19 2Q14 8 6 4Q3 0 0-1Q-3 0-6 4Q-14 8-19 2Z" fill="${INK}" ${ink(1.5)}/><path d="M-15-3h4M8-3h4" stroke="#8fd7ff" stroke-width="2.5" stroke-linecap="round"/>`;
    default: // None: little dots
      return `<circle cx="-9" cy="-1" r="3" fill="${INK}"/><circle cx="9" cy="-1" r="3" fill="${INK}"/>`;
  }
}

/** An animation's delay, so it carries on where it was when the Wumble's redrawn at `clock` seconds. */
function delay(period: number, clock: number, offset: number) {
  return `animation-delay:-${((((clock + offset) % period) + period) % period).toFixed(2)}s`;
}

export interface ArtOptions {
  /** Seconds on a steady clock (e.g. performance.now() / 1000), so idle animations don't jump when redrawn. */
  clock?: number;
}

/** A Wumble, centred in a box from -50 to 50 each way. A -1 trait is left plain. */
export function wumbleSvg(t: Traits, { clock = 0 }: ArtOptions = {}) {
  const [colour, hatI, eyesI, feetI] = t;
  // Each Wumble keeps its own rhythm, so a crowd doesn't move in step.
  const seed = ((colour + 1) * 7 + (hatI + 1) * 13 + (eyesI + 1) * 17 + (feetI + 1) * 23) * 0.37;
  const fill = `url(#cw-g${colour >= 0 ? colour : PAINTS.length})`;
  const spinDelay = delay(PERIODS.spin, clock, seed);
  const boingDelay = delay(PERIODS.boing, clock, seed);
  const feetSvg = feet(feetI).replaceAll('class="cw-spin"', `class="cw-spin" style="${spinDelay}"`).replaceAll('class="cw-boing"', `class="cw-boing" style="${boingDelay}"`);
  return (
    `<g transform="translate(0 -3) scale(.88)">` +
    `<ellipse cx="0" cy="54" rx="24" ry="5" fill="${INK}" opacity=".3"/>` +
    `<g class="cw-hop"><g class="cw-bob" style="${delay(PERIODS.bob, clock, seed)}">` +
    `<g class="cw-feet cw-f${feetI}">${feetSvg}</g>` +
    // Everything above the feet, so springs can carry the body down and up with them.
    `<g class="cw-top"${feetI === 2 ? ` style="${boingDelay}"` : ''}>` +
    `<path d="M-26 8C-28-14-14-26 2-25C20-24 30-10 28 10C27 28 14 34 0 34C-16 34-25 26-26 8Z" fill="${fill}" ${ink(3)}/>` +
    `<ellipse cx="-11" cy="-13" rx="6" ry="3.5" fill="#fff" opacity=".55" transform="rotate(-30 -11 -13)"/>` +
    `<ellipse cx="-17" cy="11" rx="4.5" ry="2.5" fill="#ff7aa2" opacity=".55"/><ellipse cx="17" cy="11" rx="4.5" ry="2.5" fill="#ff7aa2" opacity=".55"/>` +
    `<path d="M-6 14Q0 20 6 14" fill="none" ${ink()}/>` +
    `<g class="cw-hat" style="${delay(PERIODS.hat, clock, seed * 1.3)}">${hat(hatI)}</g>` +
    `<g class="cw-eyes" style="${delay(PERIODS.eyes, clock, seed * 2)}">${eyes(eyesI)}</g>` +
    `</g></g></g></g>`
  );
}
