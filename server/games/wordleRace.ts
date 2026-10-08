import {
  WORDLE_RACE,
  WORD_LENGTH,
  scoreGuess,
  type WordleGuess,
  type WordleHostView,
  type WordleInput,
  type WordleModeId,
  type WordlePhase,
  type WordlePlayerView,
} from '../../shared/games/wordleRace';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { define } from './definitions';
import { isValidGuess, pickAnswers } from './words';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';

const COUNTDOWN_MS = 4_000;
/** Round length per mode. Hard words are obscure, so players get longer. */
const ROUND_MS: Record<WordleModeId, number> = { normal: 150_000, hard: 240_000 };

// Scoring: points = (seconds left - GUESS_COST_MS x guesses) x POINTS_PER_SECOND.
// Each guess is worth 8 seconds of points in both modes (the clock itself isn't
// affected), so solving quickly and in few guesses both matter. Anyone who solves
// gets at least MIN_POINTS.
const GUESS_COST_MS = 8_000;
const POINTS_PER_SECOND = 10;
const MIN_POINTS = 100;

export function roundPoints(msLeft: number, guesses: number): number {
  const seconds = (msLeft - guesses * GUESS_COST_MS) / 1000;
  return Math.max(MIN_POINTS, Math.round(seconds * POINTS_PER_SECOND));
}

interface Progress {
  guesses: WordleGuess[];
  solved: boolean;
  finishRank: number | null;
  solvedMsLeft: number | null;
  roundPoints: number;
  error: string | null;
}

class WordleRace implements MiniGame {
  private phase: WordlePhase = 'countdown';
  private round = 0;
  private answers: string[];
  private progress = new Map<string, Progress>();
  /** Points each player has earned in this game (shown on the round scores screen). */
  private gamePoints = new Map<string, number>();
  private finishers = 0;
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly mode: WordleModeId,
    /** Words to play this game (each one is a "round" inside Word Rush). */
    private readonly totalWords: number,
  ) {
    this.answers = pickAnswers(totalWords, mode);
  }

  private get answer() {
    return this.answers[this.round - 1];
  }

  start() {
    this.startRound(1);
  }

  private setPhase(phase: WordlePhase, durationMs: number, next: () => void) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + durationMs;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, durationMs);
    this.syncAll();
  }

  private startRound(round: number) {
    this.round = round;
    this.finishers = 0;
    this.progress.clear();
    for (const p of this.ctx.players()) {
      this.progress.set(p.id, { guesses: [], solved: false, finishRank: null, solvedMsLeft: null, roundPoints: 0, error: null });
    }
    this.setPhase('countdown', COUNTDOWN_MS, () => this.setPhase('playing', ROUND_MS[this.mode], () => this.endRound()));
  }

  /** Every word ends with the same reveal; after the last one comes the round scores. */
  private endRound() {
    const isLast = this.round >= this.totalWords;
    this.setPhase('roundEnd', PUZZLE_RESULT_MS, () => {
      if (isLast) this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
      else this.startRound(this.round + 1);
    });
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as WordleInput;
    if (this.phase !== 'playing' || input?.type !== 'guess' || typeof input.word !== 'string') return;
    const prog = this.progress.get(playerId);
    if (!prog || prog.solved) return;

    const word = input.word.trim().toUpperCase();
    if (word.length !== WORD_LENGTH || !/^[A-Z]+$/.test(word)) {
      prog.error = `Guess must be ${WORD_LENGTH} letters.`;
    } else if (!isValidGuess(word)) {
      prog.error = 'Not in word list.';
    } else {
      prog.error = null;
      const result = scoreGuess(word, this.answer);
      prog.guesses.push({ word, result });

      if (word === this.answer) {
        prog.solved = true;
        prog.finishRank = ++this.finishers;
        prog.solvedMsLeft = this.msLeft();
        prog.roundPoints = roundPoints(prog.solvedMsLeft, prog.guesses.length);
        this.ctx.addScore(playerId, prog.roundPoints);
        this.gamePoints.set(playerId, (this.gamePoints.get(playerId) ?? 0) + prog.roundPoints);
      }
    }

    this.syncPlayer(playerId);
    this.syncHost();
    // End early once every connected player is done, so nobody waits on someone who left.
    const connected = new Set(this.ctx.players().filter((p) => p.connected).map((p) => p.id));
    const allDone = [...this.progress].every(([id, p]) => p.solved || !connected.has(id));
    if (allDone) this.endRound();
  }

  private guessCostSeconds() {
    return GUESS_COST_MS / 1000;
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  /** The answer is only revealed once the round is over. */
  private revealedAnswer() {
    return this.phase === 'roundEnd' || this.phase === 'gameEnd' ? this.answer : null;
  }

  private revealedDefinition() {
    const answer = this.revealedAnswer();
    return answer ? define(answer) : null;
  }

  syncHost() {
    const players = this.ctx.players();
    const view: WordleHostView = {
      phase: this.phase,
      mode: this.mode,
      guessCostSeconds: this.guessCostSeconds(),
      round: this.round,
      totalRounds: this.totalWords,
      msLeft: this.msLeft(),
      answer: this.revealedAnswer(),
      definition: this.revealedDefinition(),
      players: players
        .filter((p) => this.progress.has(p.id))
        .map((p) => {
          const prog = this.progress.get(p.id)!;
          return {
            id: p.id,
            name: p.name,
            color: p.color,
            rows: prog.guesses.map((g) => g.result),
            solved: prog.solved,
            finishRank: prog.finishRank,
            solvedMsLeft: prog.solvedMsLeft,
            roundPoints: prog.roundPoints,
            gamePoints: this.gamePoints.get(p.id) ?? 0,
            score: p.score,
          };
        }),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const prog = this.progress.get(playerId);
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!prog || !player) return;
    const view: WordlePlayerView = {
      phase: this.phase,
      mode: this.mode,
      guessCostSeconds: this.guessCostSeconds(),
      round: this.round,
      totalRounds: this.totalWords,
      msLeft: this.msLeft(),
      guesses: prog.guesses,
      solved: prog.solved,
      finishRank: prog.finishRank,
      solvedMsLeft: prog.solvedMsLeft,
      roundPoints: prog.roundPoints,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      answer: this.revealedAnswer(),
      definition: this.revealedDefinition(),
      error: prog.error,
    };
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    this.syncHost();
    for (const id of this.progress.keys()) this.syncPlayer(id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const wordleRace: MiniGameDefinition = {
  info: WORDLE_RACE,
  create: (ctx, modeId, options) => new WordleRace(ctx, modeId as WordleModeId, options.puzzles),
};
