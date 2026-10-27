import type { Controller } from './main';

/** A machine-local add-on game's phone screen (local/<name>/phone.ts; see server/games/addons.ts). */
export interface PhoneAddOn {
  gameId: string;
  create(root: HTMLElement, send: (input: unknown) => void): Controller;
}

/** Every add-on's phone screen; none if /local isn't there. */
export const PHONE_ADDONS = Object.values(import.meta.glob<PhoneAddOn>('../../local/*/phone.ts', { eager: true }));
