// The server's clock, as near as we can tell, for timing games: taps are stamped with it and beats
// and reveals are scheduled on it, so everyone's judged the same however slow their connection.
// On joining, the phone asks the server the time a few times and keeps the answer from the
// quickest round trip (half of which is how stale the answer was).

let offset = 0;
let bestRtt = Infinity;

/** Asks a few times (`ping` resolves with the server's time) and keeps the best estimate. */
export async function syncClock(ping: () => Promise<number>, samples = 6) {
  for (let i = 0; i < samples; i++) {
    const sent = Date.now();
    let server: number;
    try {
      server = await ping();
    } catch {
      continue;
    }
    const back = Date.now();
    const rtt = back - sent;
    if (rtt <= bestRtt) {
      bestRtt = rtt;
      offset = server + rtt / 2 - back;
    }
  }
}

/** Forgets the estimate (e.g. after reconnecting). */
export function resetClock() {
  bestRtt = Infinity;
}

/** The server's time now (ms since the epoch). */
export const serverNow = () => Date.now() + offset;
