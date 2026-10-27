import type Phaser from 'phaser';

/** A machine-local add-on game's TV scene (local/<name>/tv.ts; see server/games/addons.ts). */
export interface TvAddOn {
  gameId: string;
  Scene: (new () => Phaser.Scene) & { KEY: string };
}

/** Every add-on's TV scene; none if /local isn't there. */
export const TV_ADDONS = Object.values(import.meta.glob<TvAddOn>('../../local/*/tv.ts', { eager: true }));
