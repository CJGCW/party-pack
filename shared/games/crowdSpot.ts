import type { GameInfo } from '../protocol';
import type { VolleyHostView, VolleyPlayerView } from '../volleys';

export const CROWD_SPOT: GameInfo = {
  id: 'crowd-spot',
  name: 'Crowd Spot',
  description: 'A crowd drifts by. Each time you are asked to find someone: the odd one out, or the one with a particular hat and glasses. Tap them on your phone, quick! A wrong tap costs you a few seconds. Five finds a round.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Five finds a round; quickest finders win.' }],
};

// A volleys game (see shared/volleys.ts): each volley is one find. The crowd (who's in it, and
// where they drift) comes from the seed, so the phones and the TV draw the same crowd at the same
// moment; the server knows who the answer is and judges taps.

export const FINDS = 5;
export const FIND_MS = 20_000;
export const REVEAL_MS = 3_000;
/** A wrong tap locks you out for this long. */
export const WRONG_MS = 3_000;
export const FIELD_W = 1000;
export const FIELD_H = 560;
export const PERSON_R = 34;
export const CROWD = 26;

export const SKINS = ['#f2c9a0', '#d9a066', '#a8714a', '#6b4423'];
export const HAT_KINDS = ['none', 'cap', 'top', 'bow'] as const;
export const HAT_COLORS = ['#ff5d73', '#5ec8f2', '#4cd37a', '#ffd166', '#b48cff'];
export const HAT_COLOR_NAMES = ['red', 'blue', 'green', 'yellow', 'purple'];
export const EYES = ['dots', 'glasses', 'shades'] as const;
export const MOUTHS = ['smile', 'o', 'flat'] as const;

export interface Person {
  skin: number;
  hat: number;
  hatColor: number;
  eyes: number;
  mouth: number;
  /** Where they start, and their drift (units a second; they wrap round). */
  x: number;
  y: number;
  vx: number;
}

export interface Find {
  people: Person[];
  /** Who you're looking for, and what you're told. */
  answer: number;
  prompt: string;
}

/** Find number `n` of the round: its crowd, its answer and what to say. */
export function findFor(seed: number, n: number): Find {
  let s = (seed + n * 7_919) >>> 0 || 1;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pick = (k: number) => Math.floor(random() * k);
  // Spread out in rows, drifting one way or the other.
  const place = (i: number) => {
    const row = i % 4;
    return { x: random() * FIELD_W, y: 80 + row * 135 + (random() - 0.5) * 30, vx: (row % 2 ? 1 : -1) * (35 + random() * 35) };
  };
  if (n % 2 === 1) {
    // The odd one out: everyone the same but one, who differs in one thing.
    const base = { skin: pick(4), hat: pick(4), hatColor: pick(5), eyes: pick(3), mouth: pick(3) };
    const answer = pick(CROWD);
    const people = Array.from({ length: CROWD }, (_, i) => ({ ...base, ...place(i) }));
    const odd = { ...people[answer] };
    const what = pick(3);
    if (what === 0) odd.eyes = (odd.eyes + 1 + pick(2)) % 3;
    else if (what === 1) odd.mouth = (odd.mouth + 1 + pick(2)) % 3;
    else odd.hatColor = (odd.hatColor + 1 + pick(4)) % 5;
    people[answer] = odd;
    return { people, answer, prompt: 'Find the odd one out!' };
  }
  // A description: exactly one fits it.
  const people: Person[] = [];
  for (let i = 0; i < CROWD; i++) people.push({ skin: pick(4), hat: pick(4), hatColor: pick(5), eyes: pick(3), mouth: pick(3), ...place(i) });
  const answer = pick(CROWD);
  const t = people[answer];
  if (t.hat === 0) t.hat = 1 + pick(3);
  const fits = (p: Person) => p.hat === t.hat && p.hatColor === t.hatColor && p.eyes === t.eyes;
  // Anyone else who fits gets their eyes changed.
  people.forEach((p, i) => {
    if (i !== answer && fits(p)) p.eyes = (p.eyes + 1) % 3;
  });
  const hatName = HAT_KINDS[t.hat] === 'top' ? 'top hat' : HAT_KINDS[t.hat];
  const eyesName = EYES[t.eyes] === 'dots' ? 'no glasses' : EYES[t.eyes] === 'glasses' ? 'glasses' : 'sunglasses';
  return { people, answer, prompt: `Find the one with a ${HAT_COLOR_NAMES[t.hatColor]} ${hatName} and ${eyesName}!` };
}

/** Where someone is `ms` into the find (they drift and wrap round). */
export function personAt(p: Person, ms: number) {
  const span = FIELD_W + PERSON_R * 4;
  const x = ((((p.x + PERSON_R * 2 + (p.vx * ms) / 1000) % span) + span) % span) - PERSON_R * 2;
  return { x, y: p.y };
}

/** Who's under a tap at (x, y), `ms` into the find (the nearest within reach), or -1. */
export function personUnder(find: Find, x: number, y: number, ms: number) {
  let best = -1;
  let bestD = PERSON_R * 1.3;
  find.people.forEach((p, i) => {
    const at = personAt(p, ms);
    const d = Math.hypot(at.x - x, at.y - y);
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

export interface SpotAim {
  /** When they found them (ms into the find), or null. */
  foundMs: number | null;
}

export interface SpotBoardState {
  found: boolean;
  foundMs: number | null;
  wrong: number;
  /** Locked out after a wrong tap, for this long. */
  lockedMs: number;
}

export interface SpotRound {
  /** When this find started (server time), which find it is, and (at the reveal) the answer. */
  startedAt: number;
  find: number;
  answer: number | null;
}

export interface SpotPlayerState extends SpotBoardState {
  startedAt: number;
  find: number;
  answer: number | null;
}

export type SpotHostView = VolleyHostView<SpotBoardState, SpotRound>;
export type SpotPlayerView = VolleyPlayerView<SpotPlayerState>;

export type SpotInput = { type: 'tap'; x: number; y: number; ms: number };
