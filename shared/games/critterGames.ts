import { critterInfo, type LevelSpec, type Traits } from '../critters';

// The Wumble logic puzzles: each is its own game, with four difficulties and a Rising mode.

const min = (m: number, s = 0) => m * 60_000 + s * 1000;

// ---------- Two Doors: which door takes which Wumble? ----------
export const TWO_DOORS_LEVELS: LevelSpec[] = [
  { name: 'Easy', description: 'One thing decides it.', ms: min(1, 30), tries: 6 },
  { name: 'Medium', description: 'Two options of the same trait decide it.', ms: min(2), tries: 6 },
  { name: 'Hard', description: 'Two different traits decide it.', ms: min(2, 30), tries: 6 },
  { name: 'Very hard', description: 'Four doors, and two rules at once.', ms: min(3), tries: 8 },
];
export const TWO_DOORS = critterInfo('two-doors', 'Two Doors', 'Every Wumble fits through just one door. Send them through, watch who bounces off, and work out what the doors want.', TWO_DOORS_LEVELS);
export interface DoorsState {
  doors: number;
  /** Everyone, and for those still waiting, the doors that have turned them away. */
  critters: { t: Traits; door: number | null; refused: number[] }[];
  /** At the reveal: the door each one belonged to. */
  answer: number[] | null;
}

// ---------- Picky Eater: what does the customer want? ----------
export const TOPPINGS = ['🍄', '🧀', '🥕', '🍅', '🥦', '🍋', '🍇', '🍓', '🍌', '🍒'];
export const PICKY_LEVELS: (LevelSpec & { toppings: number; wants: number; customers: number })[] = [
  { name: 'Easy', description: 'One customer, six toppings.', ms: min(1, 30), tries: 8, toppings: 6, wants: 2, customers: 1 },
  { name: 'Medium', description: 'One customer, eight toppings.', ms: min(2), tries: 10, toppings: 8, wants: 3, customers: 1 },
  { name: 'Hard', description: 'Two customers, eight toppings.', ms: min(2, 30), tries: 16, toppings: 8, wants: 3, customers: 2 },
  { name: 'Very hard', description: 'Three customers, ten toppings.', ms: min(3, 30), tries: 26, toppings: 10, wants: 4, customers: 3 },
];
export const PICKY_EATER = critterInfo('picky-eater', 'Picky Eater', 'Build the order and serve it. The customer only says "more!", "yuck!" or "yum!": work out exactly what they want.', PICKY_LEVELS);
export type PickyReply = 'more' | 'yuck' | 'yum';
export interface PickyState {
  toppings: string[];
  customers: Traits[];
  /** The customer being served (customers.length when they've all eaten). */
  serving: number;
  /** What they've been served so far. */
  orders: { picks: number[]; reply: PickyReply }[];
  /** At the reveal: what each customer wanted. */
  wants: number[][] | null;
}

// ---------- Seating Chart: neighbours must have something in common ----------
export interface SeatEdge {
  a: number;
  b: number;
  /** The trait this pair must share (null for any). */
  tag: number | null;
}
export const SEATING_LEVELS: (LevelSpec & { rows: number; cols: number; tags: boolean })[] = [
  { name: 'Easy', description: 'A bench of six: neighbours share a trait.', ms: min(1, 30), tries: 6, rows: 1, cols: 6, tags: false },
  { name: 'Medium', description: 'Two rows of four, back to back.', ms: min(2), tries: 6, rows: 2, cols: 4, tags: false },
  { name: 'Hard', description: 'Three rows of three: up to four neighbours each.', ms: min(3), tries: 6, rows: 3, cols: 3, tags: false },
  { name: 'Very hard', description: 'Three rows of three, and each link says which trait to share.', ms: min(4), tries: 6, rows: 3, cols: 3, tags: true },
];
export const SEATING_CHART = critterInfo('seating-chart', 'Seating Chart', 'Seat every Wumble so that neighbours have something in common. Get it wrong and they bounce straight back out.', SEATING_LEVELS);
export interface SeatingState {
  rows: number;
  cols: number;
  edges: SeatEdge[];
  critters: Traits[];
  /** Who's in each seat. */
  seats: (number | null)[];
  /** At the reveal: a seating that works. */
  answer: number[] | null;
}

// ---------- Lookalikes: which robot is each Wumble's cousin? ----------
export const LOOKALIKE_LEVELS: (LevelSpec & { active: number; cross: boolean })[] = [
  { name: 'Easy', description: "Two traits matter, and a Wumble's colour goes with a robot's colour.", ms: min(1, 30), tries: 5, active: 2, cross: false },
  { name: 'Medium', description: 'Three traits matter.', ms: min(2), tries: 5, active: 3, cross: false },
  { name: 'Hard', description: 'Two traits matter, but they cross over: hats might go with colours.', ms: min(2, 30), tries: 5, active: 2, cross: true },
  { name: 'Very hard', description: 'Three traits matter, and they cross over.', ms: min(3), tries: 5, active: 3, cross: true },
];
export const LOOKALIKES = critterInfo('lookalikes', 'Lookalikes', "Every Wumble has a robot cousin. The pairs at the top show how they go together: match the rest.", LOOKALIKE_LEVELS);
export interface LookalikeState {
  examples: { w: Traits; b: Traits }[];
  critters: Traits[];
  bots: Traits[];
  /** By critter: the bot they've been matched with. */
  matched: (number | null)[];
  /** The pairings that have failed, as [critter, bot]. */
  refused: [number, number][];
  answer: number[] | null;
}

// ---------- Room Sort: one guest at a time, into the only room that suits them ----------
export const ROOM_LEVELS: (LevelSpec & { rows: number; cols: number; floors: number; clues: number })[] = [
  { name: 'Easy', description: 'Three by three: two traits pick the room.', ms: min(1, 30), tries: 8, rows: 3, cols: 3, floors: 1, clues: 2 },
  { name: 'Medium', description: 'Four by four.', ms: min(2, 30), tries: 10, rows: 4, cols: 4, floors: 1, clues: 3 },
  { name: 'Hard', description: 'Two floors: a third trait picks the floor.', ms: min(3), tries: 12, rows: 3, cols: 3, floors: 2, clues: 3 },
  { name: 'Very hard', description: 'Two bigger floors.', ms: min(4), tries: 14, rows: 4, cols: 3, floors: 2, clues: 4 },
];
export const ROOM_SORT = critterInfo('room-sort', 'Room Sort', 'Each guest belongs in one room, but only some of their traits matter. Work out which, and fill the hotel.', ROOM_LEVELS);
export interface RoomState {
  rows: number;
  cols: number;
  floors: number;
  /** By room: who's in it. */
  rooms: (Traits | null)[];
  /** The guest to place. */
  guest: Traits | null;
  /** Rooms this guest has been turned away from. */
  refused: number[];
  next: number;
  total: number;
}

// ---------- Line Up: the right order ----------
/** A clue: a trait's options, first to last, with gaps at null. */
export interface Ladder {
  trait: number;
  values: (number | null)[];
}
export const LINE_UP_LEVELS: (LevelSpec & { count: number; primary: number; secondary: number; gaps: [number, number] })[] = [
  { name: 'Easy', description: 'Five Wumbles, one trait, and a full clue.', ms: min(1, 30), tries: 6, count: 5, primary: 5, secondary: 0, gaps: [0, 0] },
  { name: 'Medium', description: 'Six Wumbles, sorted by one trait and then another.', ms: min(2), tries: 7, count: 6, primary: 3, secondary: 3, gaps: [0, 0] },
  { name: 'Hard', description: 'Seven Wumbles, and part of the clue is missing.', ms: min(2, 30), tries: 8, count: 7, primary: 3, secondary: 3, gaps: [0, 1] },
  { name: 'Very hard', description: 'Eight Wumbles, and more of the clue is missing.', ms: min(3), tries: 8, count: 8, primary: 4, secondary: 3, gaps: [1, 1] },
];
export const LINE_UP = critterInfo('line-up', 'Line Up', 'Put the Wumbles in order. The clue tells you some of how, and every check shows who is in the right place.', LINE_UP_LEVELS);
export interface LineUpState {
  critters: Traits[];
  /** Who's in each place. */
  line: number[];
  /** By place: true if the last check said it's right (cleared when they're moved). */
  marks: boolean[];
  ladders: Ladder[];
  answer: number[] | null;
}

// ---------- Lens Lab: what comes out the other side? ----------
export const LENS_LEVELS: (LevelSpec & { lenses: number; targets: number; pool: number; conditional: boolean })[] = [
  { name: 'Easy', description: 'One lens.', ms: min(1, 30), tries: 5, lenses: 1, targets: 3, pool: 6, conditional: false },
  { name: 'Medium', description: 'Two lenses.', ms: min(2), tries: 6, lenses: 2, targets: 4, pool: 8, conditional: false },
  { name: 'Hard', description: 'Three lenses.', ms: min(2, 30), tries: 7, lenses: 3, targets: 4, pool: 8, conditional: false },
  { name: 'Very hard', description: 'Three lenses, and one only works on some Wumbles.', ms: min(3), tries: 8, lenses: 3, targets: 5, pool: 10, conditional: true },
];
export const LENS_LAB = critterInfo('lens-lab', 'Lens Lab', 'The lenses change every Wumble that walks through. Work out how, and send in the ones that come out looking like the pictures.', LENS_LEVELS);
export interface LensState {
  lenses: number;
  /** Everyone who can walk in; null once they've made it. */
  pool: (Traits | null)[];
  targets: { t: Traits; done: boolean }[];
  /** What's gone through so far. */
  tests: { from: Traits; to: Traits; hit: boolean }[];
  /** At the reveal: for each target, who it should've been. */
  answer: Traits[] | null;
}

// ---------- Switchback: order matters ----------
/** A junction: a test sends them left if they match, a switch flips each time someone passes, and at a start you pick the way. */
export type Gate = { kind: 'test'; trait: number; value: number } | { kind: 'switch' } | { kind: 'start' };
export const SWITCH_LEVELS: (LevelSpec & { depth: number; critters: number; switches: number; starts: number })[] = [
  { name: 'Easy', description: 'Four Wumbles, one switch.', ms: min(1, 30), tries: 3, depth: 2, critters: 4, switches: 1, starts: 1 },
  { name: 'Medium', description: 'Five Wumbles, two switches.', ms: min(2), tries: 3, depth: 2, critters: 5, switches: 2, starts: 1 },
  { name: 'Hard', description: 'A longer track, three switches, and two ways in.', ms: min(2, 30), tries: 3, depth: 3, critters: 5, switches: 3, starts: 2 },
  { name: 'Very hard', description: 'Six Wumbles, four switches, and two ways in.', ms: min(3), tries: 3, depth: 3, critters: 6, switches: 4, starts: 2 },
];
export const SWITCHBACK = critterInfo('switchback', 'Switchback', 'Each Wumble takes the track its traits send it down, and every switch flips as they pass. Pick the order that gets them all home.', SWITCH_LEVELS);
export interface SwitchState {
  depth: number;
  gates: Gate[];
  /** By gate: which way a switch points now (true for right). */
  flipped: boolean[];
  /** By exit: home, or a dead end. */
  exits: boolean[];
  critters: { t: Traits; home: boolean }[];
  /** The last run: the gates passed and where it came out. */
  last: { critter: number; gates: number[]; exit: number } | null;
  /** At the reveal: an order that works. */
  answer: number[] | null;
}

// ---------- Stepping Stones: a path across ----------
export const STONES_LEVELS: (LevelSpec & { rows: number; cols: number; beats: number; mixed: boolean; rocks: number; swaps: number })[] = [
  { name: 'Easy', description: 'Every stone has one thing in common.', ms: min(1, 30), tries: 5, rows: 5, cols: 6, beats: 1, mixed: false, rocks: 0, swaps: 0 },
  { name: 'Medium', description: 'A pattern of two.', ms: min(2), tries: 6, rows: 5, cols: 6, beats: 2, mixed: false, rocks: 0, swaps: 0 },
  { name: 'Hard', description: 'A pattern of three, with rocks in the way, and a stone out of place: your wand can swap two neighbours.', ms: min(2, 30), tries: 7, rows: 5, cols: 6, beats: 3, mixed: false, rocks: 4, swaps: 1 },
  { name: 'Very hard', description: 'A pattern of three that changes what it looks at, with rocks and two swaps of the wand.', ms: min(3, 30), tries: 8, rows: 6, cols: 7, beats: 3, mixed: true, rocks: 6, swaps: 2 },
];
export const STEPPING_STONES = critterInfo('stepping-stones', 'Stepping Stones', 'Cross from left to right. Only the stones that follow the hidden pattern will hold you.', STONES_LEVELS);
export interface StonesState {
  rows: number;
  cols: number;
  tiles: (Traits | null)[];
  /** The crossing so far. */
  path: number[];
  /** Stones already tried at this step that didn't hold. */
  wrong: number[];
  /** Swaps of the wand left, and how many it had. */
  swapsLeft: number;
  swaps: number;
  /** At the reveal: a way across that works. */
  answer: number[] | null;
}
