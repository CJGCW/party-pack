import { EXTERNAL, WIN_POINTS_PER_PUZZLE, type ExternalInput, type ExternalPlayerView, type ExternalView } from '../../shared/games/external';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';

/** A game played away from the app: it shows what to play, until the VIP marks it finished and taps who won. */
class External implements MiniGame {
  private readonly startedAt = Date.now();
  private finished = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly name: string,
    /** What each winner scores: a full round's worth. */
    private readonly winPoints: number,
  ) {}

  start() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as ExternalInput;
    if (input?.type !== 'finish' || this.finished) return;
    const players = this.ctx.players();
    if (!players.find((p) => p.id === playerId)?.isVip) return;
    this.finished = true;
    const winners = new Set(Array.isArray(input.winners) ? input.winners.map(String) : []);
    for (const p of players) if (winners.has(p.id)) this.ctx.addScore(p.id, this.winPoints);
    this.ctx.finish();
  }

  private view(): ExternalView {
    return {
      name: this.name,
      elapsedMs: Date.now() - this.startedAt,
      vipName: this.ctx.players().find((p) => p.isVip)?.name ?? '',
    };
  }

  syncHost() {
    this.ctx.sendHost(this.view());
  }

  syncPlayer(playerId: string) {
    const isVip = !!this.ctx.players().find((p) => p.id === playerId)?.isVip;
    const players = this.ctx.players().filter((p) => p.connected).map((p) => ({ id: p.id, name: p.name, color: p.color }));
    const view: ExternalPlayerView = { ...this.view(), isVip, players, winPoints: this.winPoints };
    this.ctx.sendPlayer(playerId, view);
  }

  dispose() {}
}

/** Not in GAMES (it's not a slice of its own): each external game the VIP lists is one. */
export const external: MiniGameDefinition = {
  info: EXTERNAL,
  create: (ctx, _modeId, options) => new External(ctx, options.externalGame ?? EXTERNAL.name, WIN_POINTS_PER_PUZZLE * options.puzzles),
};
