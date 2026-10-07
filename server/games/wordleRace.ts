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

const TOTAL_ROUNDS = 3;
const COUNTDOWN_MS = 4_000;
const ROUND_MS = 150_000;
const ROUND_END_MS = 9_000;
const GAME_END_MS = 15_000;

/** Points by finishing position; anyone after 5th gets the last value. */
const RANK_POINTS = [1000, 750, 600, 500, 400];
/** Guesses are unlimited, but solving in under PAR_GUESSES earns a bonus per guess saved. */
const PAR_GUESSES = 6;
const UNDER_PAR_BONUS = 50;

interface Progress {
  guesses: WordleGuess[];
  solved: boolean;
  finishRank: number | null;
  roundPoints: number;
  error: string | null;
}

class WordleRace implements MiniGame {
  private phase: WordlePhase = 'countdown';
  private round = 0;
  private answers: string[];
  private progress = new Map<string, Progress>();
  private finishers = 0;
  private phaseEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly mode: WordleModeId,
  ) {
    this.answers = pickAnswers(TOTAL_ROUNDS, mode);
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
      this.progress.set(p.id, { guesses: [], solved: false, finishRank: null, roundPoints: 0, error: null });
    }
    this.setPhase('countdown', COUNTDOWN_MS, () => this.setPhase('playing', ROUND_MS, () => this.endRound()));
  }

  private endRound() {
    if (this.round >= TOTAL_ROUNDS) {
      this.setPhase('gameEnd', GAME_END_MS, () => this.ctx.finish());
    } else {
      this.setPhase('roundEnd', ROUND_END_MS, () => this.startRound(this.round + 1));
    }
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
        const rankPoints = RANK_POINTS[Math.min(prog.finishRank, RANK_POINTS.length) - 1];
        prog.roundPoints = rankPoints + Math.max(0, PAR_GUESSES - prog.guesses.length) * UNDER_PAR_BONUS;
        this.ctx.addScore(playerId, prog.roundPoints);
      }
    }

    this.syncPlayer(playerId);
    this.syncHost();
    // End early once every connected player is done, so nobody waits on someone who left.
    const connected = new Set(this.ctx.players().filter((p) => p.connected).map((p) => p.id));
    const allDone = [...this.progress].every(([id, p]) => p.solved || !connected.has(id));
    if (allDone) this.endRound();
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
      round: this.round,
      totalRounds: TOTAL_ROUNDS,
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
            roundPoints: prog.roundPoints,
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
      round: this.round,
      totalRounds: TOTAL_ROUNDS,
      msLeft: this.msLeft(),
      guesses: prog.guesses,
      solved: prog.solved,
      finishRank: prog.finishRank,
      roundPoints: prog.roundPoints,
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
  create: (ctx, modeId) => new WordleRace(ctx, modeId as WordleModeId),
};
