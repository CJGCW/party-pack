import type { GameInfo } from '../protocol';

/**
 * Co-op word clues, in the style of the two-player co-op variant of a well-known
 * spy word game, stretched to a whole group: everyone knows only some of the
 * target words, and takes turns giving one-word clues for theirs.
 */
export const CLUE_CREW: GameInfo = {
  id: 'clue-crew',
  name: 'Clue Crew',
  description:
    'Co-op word clues. Each of you secretly knows some of the words to find, and a couple of traps. Take turns giving one-word clues; the others guess.',
  minPlayers: 2,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'A 5 by 5 board. Each round, everyone gives one clue.' }],
};

export const BOARD_WORDS = 25;
export const BOARD_COLS = 5;
/** The most a clue's number can be. */
export const MAX_CLUE_NUMBER = 5;

/** What a word is to one player: one of the targets they know, one of their traps, or neither. */
export type CardKind = 'target' | 'trap' | 'neutral';

/**
 * 'clue': the clue-giver types a clue; everyone else waits.
 * 'guess': the others vote for a word (or to stop).
 * 'result': what the vote revealed, briefly.
 * 'gameEnd': the board's outcome and the round scores.
 */
export type CrewPhase = 'clue' | 'guess' | 'result' | 'gameEnd';

export interface CrewCard {
  word: string;
  /** A target that's been found. */
  found: boolean;
}

/** What the last vote did. */
export interface CrewResult {
  /** The word picked (null when the team stopped or nobody voted). */
  index: number | null;
  kind: 'target' | 'neutral' | 'trap' | 'stop';
}

export interface CrewClue {
  word: string;
  number: number;
}

interface CrewViewBase {
  phase: CrewPhase;
  /** Round (from 1) and how many; in each round every player gives one clue. */
  round: number;
  totalRounds: number;
  /** Turn within the round (from 1) and turns per round. */
  turn: number;
  turnsPerRound: number;
  giverId: string;
  giverName: string;
  clue: CrewClue | null;
  /** Guesses left on this clue (the number plus one). */
  guessesLeft: number;
  cards: CrewCard[];
  found: number;
  totalTargets: number;
  /** Votes so far on the current guess, as a count per card. */
  voteCounts: number[];
  stopVotes: number;
  last: CrewResult | null;
  /** At the end: whether the team found everything, hit a trap, or ran out of turns. */
  outcome: 'complete' | 'trap' | 'outOfTurns' | null;
  msLeft: number;
}

export interface CrewHostPlayer {
  id: string;
  name: string;
  color: string;
  score: number;
  gamePoints: number;
  /** Has voted on the current guess. */
  voted: boolean;
}

export interface CrewHostView extends CrewViewBase {
  players: CrewHostPlayer[];
}

export interface CrewPlayerView extends CrewViewBase {
  isGiver: boolean;
  /** This player's secret key: what each card is to them. */
  key: CardKind[];
  /** Targets of theirs still to find. */
  myTargetsLeft: number;
  myVote: number | 'stop' | null;
  /** Why the last clue was refused. */
  clueError: string | null;
  gamePoints: number;
  score: number;
}

export type CrewInput =
  /** The clue-giver's clue: one word and how many words it's for. */
  | { type: 'clue'; word: string; number: number }
  /** A guesser's vote for a card. */
  | { type: 'vote'; index: number }
  /** A guesser's vote to stop guessing this clue. */
  | { type: 'stop' };
