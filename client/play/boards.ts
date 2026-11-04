// Phone helpers for side-by-side boards games (see shared/boards.ts): what to say when a player's
// run is over, at the result and at round scores, and the clock. Each game draws its own controls.

import type { BoardsPlayerView, BoardsScoring } from '../../shared/boards';

export function ordinal(n: number) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/** True while the player has a board and their run's going (countdown included): show the controls. */
export function isPlaying(v: BoardsPlayerView<unknown>) {
  return v.hasBoard && v.endedAtMs === null && (v.phase === 'ready' || v.phase === 'play');
}

/**
 * When the controls aren't showing: a title and a few lines. `ended` describes a run that's over,
 * e.g. "Out at 47s" or "Your tower fell"; `score` how a board did, for 'best' games.
 */
export function boardsInfo(
  v: BoardsPlayerView<unknown>,
  scoring: BoardsScoring,
  { ended, score }: { ended?: (v: BoardsPlayerView<unknown>) => string; score?: (v: BoardsPlayerView<unknown>) => string } = {},
): { title: string; lines: string[] } {
  const endedText =
    ended?.(v) ?? (v.endedAtMs === null ? '' : scoring === 'race' ? `Done in ${(v.endedAtMs / 1000).toFixed(1)}s!` : `Out at ${Math.floor(v.endedAtMs / 1000)}s`);
  if (v.phase === 'ready' || v.phase === 'play') {
    if (!v.hasBoard) return { title: 'Watch the TV!', lines: ["You'll get a board next round."] };
    return { title: endedText, lines: [scoring === 'survival' ? `${v.going} of ${v.playing} still in. Watch the TV!` : `${v.going} of ${v.playing} still going. Watch the TV!`] };
  }
  if (v.phase === 'result') {
    const lines: string[] = [];
    if (scoring === 'best' && score) lines.push(score(v));
    if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
    lines.push(`+${v.points.toLocaleString()} points`);
    const title =
      scoring === 'survival'
        ? v.endedAtMs === null
          ? 'You survived!'
          : endedText
        : scoring === 'race'
          ? v.endedAtMs !== null
            ? endedText
            : "Time's up!"
          : v.place === 1
            ? 'Top of the round!'
            : 'Round over';
    return { title, lines };
  }
  return { title: 'Round scores', lines: [`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`] };
}

/** The clock: "Starting in 3" in the countdown, seconds left while playing. */
export function boardsClock(v: BoardsPlayerView<unknown>, phaseEndsAt: number): { text: string; low: boolean } {
  const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
  if (v.phase === 'ready') return { text: `Starting in ${secs}`, low: false };
  if (v.phase === 'play') return { text: `${secs}s`, low: secs <= 10 };
  return { text: '', low: false };
}
