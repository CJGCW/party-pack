import type { GameInfo, GiveUpView } from '../protocol';

/** Long-list trivia: pick, or type, every right answer. Each bank is a mode, with the same ids as Trivia's subjects. */
export const PICK_EM: GameInfo = {
  id: 'pick-em',
  name: "Pick 'Em",
  description: 'Lists with lots of right answers: tap every one you think is right, or type as many as you can name.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [
    { id: 'general', name: 'General Knowledge', description: 'Planets, primes, dinosaurs, capitals and more.' },
    { id: 'disney-pixar', name: 'Disney & Pixar', description: 'Pixar films, Disney villains, princesses and songs.' },
    { id: 'scrubs', name: 'Scrubs', description: 'Sacred Heart Hospital, seasons 1 to 8.' },
    { id: 'brooklyn-99', name: 'Brooklyn Nine-Nine', description: 'The detectives of the 99th Precinct.' },
    { id: 'parks-and-rec', name: 'Parks and Recreation', description: 'The Pawnee Parks Department.' },
  ],
};

// Scoring (on the shared 1,000-point scale): a tap list is worth up to 1,000, shared out among its
// right answers; each wrong pick takes off as much as a right one is worth (never below 0). A
// typed list is worth up to 1,000 shared among its answers; wrong guesses cost nothing.

/**
 * 'choice': tap every right answer from a list of options, then lock in.
 * 'typed': type as many right answers as you can name.
 */
export type PickKind = 'choice' | 'typed';

/**
 * 'question': the question alone, so everyone can read it.
 * 'answering': players pick (or type) answers.
 * 'reveal': the right answers, and what everyone scored.
 */
export type PickPhase = 'question' | 'answering' | 'reveal' | 'gameEnd';

export interface PickHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** Locked in (tap lists) or said they're done (typed lists). */
  answered: boolean;
  /** Typed lists: how many they've found so far (shown as a count only, never which). */
  found: number;
  /** At the reveal: right and wrong picks, and the points they came to. */
  right: number;
  wrong: number;
  points: number;
}

export interface PickHostView {
  phase: PickPhase;
  kind: PickKind;
  /** Inside another game (e.g. mixed into Trivia): shown in place of "List 1 of 1". */
  heading: string | null;
  packName: string;
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  question: string;
  /** Tap lists: the options (empty during 'question', so nobody gets a head start). */
  options: string[];
  correctIndices: number[] | null;
  /** At the reveal: how many players picked each option. */
  counts: number[] | null;
  /** Typed lists: how many answers there are, and at the reveal what they were and who found each. */
  slots: number;
  answers: string[] | null;
  foundBy: string[][] | null;
  msLeft: number;
  players: PickHostPlayer[];
}

/** The result of a typed guess, tagged with the number the phone sent it with. */
export interface PickGuessResult {
  seq: number;
  text: string;
  result: 'right' | 'wrong' | 'repeat';
  /** The answer it matched (for right and repeat). */
  answer: string | null;
}

export interface PickPlayerView extends GiveUpView {
  phase: PickPhase;
  kind: PickKind;
  heading: string | null;
  questionNumber: number;
  totalQuestions: number;
  topic: string;
  question: string;
  options: string[];
  /** Tap lists: what this player locked in (empty until they do). */
  myPicks: number[];
  correctIndices: number[] | null;
  /** Typed lists: how many answers there are, the ones this player has found, and their last guess. */
  slots: number;
  found: string[];
  lastGuess: PickGuessResult | null;
  done: boolean;
  /** At the reveal (typed lists): every answer. */
  answers: string[] | null;
  right: number;
  wrong: number;
  points: number;
  gamePoints: number;
  score: number;
  msLeft: number;
}

export type PickInput =
  /** Tap lists: lock in these options. */
  | { type: 'answer'; indices: number[] }
  /** Typed lists: one guess. */
  | { type: 'guess'; seq: number; text: string }
  /** Typed lists: finished early. */
  | { type: 'done' };

// ---- Team Pick 'Em (co-op) ------------------------------------------------------------

/** Co-op Pick 'Em: the whole party works each list together against one shared clock. */
export const PICK_EM_COOP: GameInfo = {
  id: 'pick-em-coop',
  name: "Team Pick 'Em",
  description: 'Co-op. Everyone works the same list together against one clock; every wrong answer costs the team time.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: PICK_EM.modes,
};

/** The team's clock for each list, and what each wrong pick or guess takes off it. */
export const COOP_START_MS = 180_000;
export const COOP_PENALTY_MS = 10_000;
/**
 * Team Pick 'Em, on the shared scale: everyone gets a share of COOP_FIND_POINTS for each answer the
 * team finds (split among the list's answers), and the rest of the 1,000 for clearing the list.
 */
export const COOP_FIND_POINTS = 700;

/**
 * One tile on the board. Tap lists show every option from the start; typed lists show a
 * blank slot (label null) until someone finds it. At the reveal, anything not found is 'missed'.
 */
export interface CoopTile {
  label: string | null;
  state: 'open' | 'found' | 'wrong' | 'missed';
  /** Who found it (or picked it, if wrong). */
  by: { name: string; color: string } | null;
}

/** One pick or guess, for the TV's feed and the phone's last result. */
export interface CoopEvent {
  seq: number;
  playerId: string;
  name: string;
  color: string;
  /** What they tapped or typed. */
  text: string;
  result: 'right' | 'wrong' | 'repeat';
  /** The answer it matched, for right and repeat. */
  answer: string | null;
}

interface CoopViewBase {
  phase: PickPhase;
  kind: PickKind;
  questionNumber: number;
  totalQuestions: number;
  heading: string | null;
  topic: string;
  question: string;
  /** Empty during 'question'. */
  tiles: CoopTile[];
  found: number;
  total: number;
  /** At the reveal: whether the team found everything. */
  cleared: boolean | null;
  /** Wrong answers so far on this list (each one took COOP_PENALTY_MS off the clock). */
  penalties: number;
  msLeft: number;
}

export interface PickCoopHostView extends CoopViewBase {
  packName: string;
  /** The latest picks and guesses, newest last. */
  feed: CoopEvent[];
  players: { id: string; name: string; color: string; score: number; gamePoints: number; found: number }[];
}

export interface PickCoopPlayerView extends CoopViewBase, GiveUpView {
  /** This player's latest pick or guess, matched by the seq the phone sent. */
  lastGuess: CoopEvent | null;
  gamePoints: number;
  score: number;
}

export type PickCoopInput =
  /** Tap lists: pick one option (it counts straight away). */
  | { type: 'tap'; seq: number; index: number }
  /** Typed lists: one guess. */
  | { type: 'guess'; seq: number; text: string };
