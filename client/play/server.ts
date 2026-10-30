// Where the game server is.
//
// In the browser the phone screens come from the server itself, so they connect back to
// wherever they were loaded from. The Android app carries the screens inside it (built with
// `vite build --mode app`), so it has to be told the server's address once; it's remembered.

import { h } from './dom';

/** True in the Android app's build. */
export const IN_APP = import.meta.env.MODE === 'app';

const SERVER_KEY = 'party-pack-server';
const DEFAULT_PORT = 3000;

/**
 * The server to connect to: undefined in the browser (wherever the page came from), the saved
 * address in the app, or null in the app before one's been entered.
 */
export function serverUrl(): string | undefined | null {
  if (!IN_APP) return undefined;
  return localStorage.getItem(SERVER_KEY);
}

/**
 * "10.0.0.26", "10.0.0.26:3000" or "http://10.0.0.26:3000/?code=ABCD" → "http://10.0.0.26:3000".
 * Always plain HTTP: the app doesn't need HTTPS for the motion sensors, and the server's
 * HTTPS certificate is self-signed. So an https:// address (the browser's WoochaWare one)
 * means the server's plain HTTP port instead.
 */
export function normalizeServer(input: string): string | null {
  const secure = /^https:\/\//i.test(input.trim());
  const text = input.trim().replace(/^[a-z]+:\/\//i, '');
  if (!text) return null;
  try {
    const url = new URL(`http://${text}`);
    return `http://${url.hostname}:${url.port && !secure ? url.port : DEFAULT_PORT}`;
  } catch {
    return null;
  }
}

/** Shown without the "http://" and, when it's the usual one, the port. */
export function serverLabel(url: string) {
  return url.replace(/^http:\/\//, '').replace(new RegExp(`:${DEFAULT_PORT}$`), '');
}

/** The app's "which server?" screen. Saving reloads, so everything connects fresh to the new address. */
export function renderServerPicker(app: HTMLElement, error = '') {
  const current = serverUrl();
  const input = h('input', {
    id: 'server',
    autocomplete: 'off',
    autocapitalize: 'none',
    inputmode: 'url',
    placeholder: '10.0.0.26',
    value: current ? serverLabel(current) : '',
  });
  const errorEl = h('div', { class: 'error' }, error);
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (e) => {
        e.preventDefault();
        const url = normalizeServer(input.value);
        if (!url) {
          errorEl.textContent = 'That doesn’t look like an address.';
          return;
        }
        localStorage.setItem(SERVER_KEY, url);
        location.reload();
      },
    },
    h('label', { for: 'server' }, 'SERVER'),
    input,
    h('button', { type: 'submit' }, 'Connect'),
    errorEl,
  );
  app.replaceChildren(h('h1', {}, 'PARTY PACK'), h('p', {}, 'Enter the address shown on the TV (the numbers before the colon are enough)'), form);
  input.focus();
}
