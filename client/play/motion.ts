// The phone's motion sensors, for WoochaWare's tilt, turn and shake games.
//
// Browsers only share them on secure (HTTPS) pages, and iPhones also ask the
// player's permission, which has to be requested from a tap.

const GRAVITY = 9.81;
/** A gentle shake: a jolt of this much (m/s², gravity removed), counted once per change of direction. */
const SHAKE_THRESHOLD = 4;
const SHAKE_GAP_MS = 140;

export const motion = {
  /** deviceorientation: front-back (beta) and left-right (gamma) tilt in degrees. */
  beta: null as number | null,
  gamma: null as number | null,
  orientationAt: 0,
  /** Smoothed gravity from devicemotion, in the device's own axes (m/s²). */
  gravity: { x: 0, y: GRAVITY, z: 0 },
  motionAt: 0,
  /** Shakes counted since the page loaded (each back or forth counts once). */
  shakes: 0,
  /** Smoothed size of non-gravity movement (m/s²): about 0 when held still. */
  jitter: 0,
};

let permissionGranted = false;
let lastShakeAt = 0;
let lastShake = { x: 0, y: 0, z: 0 };

window.addEventListener('deviceorientation', (e) => {
  if (e.beta === null || e.gamma === null) return;
  motion.beta = e.beta;
  motion.gamma = e.gamma;
  motion.orientationAt = performance.now();
});

window.addEventListener('devicemotion', (e) => {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x === null || a.y === null || a.z === null) return;
  const now = performance.now();
  const g = motion.gravity;
  // Low-pass for gravity; what's left over is the hand's movement.
  if (now - motion.motionAt > 500) Object.assign(g, { x: a.x, y: a.y, z: a.z });
  else {
    g.x += (a.x - g.x) * 0.12;
    g.y += (a.y - g.y) * 0.12;
    g.z += (a.z - g.z) * 0.12;
  }
  motion.motionAt = now;
  const lin = { x: a.x - g.x, y: a.y - g.y, z: a.z - g.z };
  const size = Math.hypot(lin.x, lin.y, lin.z);
  motion.jitter += (size - motion.jitter) * 0.15;
  if (size > SHAKE_THRESHOLD && now - lastShakeAt > SHAKE_GAP_MS) {
    // Only count it when the jolt changes direction, so one push isn't several shakes.
    const reversed = lin.x * lastShake.x + lin.y * lastShake.y + lin.z * lastShake.z <= 0;
    if (reversed) {
      motion.shakes++;
      lastShakeAt = now;
      lastShake = lin;
    }
  }
});

/** True while the sensors are actually reporting. */
export function sensorsLive(): boolean {
  return performance.now() - motion.orientationAt < 1000 && motion.beta !== null;
}

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** iPhones need a tap to grant motion access, once per page load. */
export function needsMotionPermission(): boolean {
  if (permissionGranted || !window.isSecureContext) return false;
  return typeof (window.DeviceOrientationEvent as unknown as PermissionApi | undefined)?.requestPermission === 'function';
}

/** Call from a tap. Resolves whether or not the player allowed it. */
export async function requestMotionPermission(): Promise<void> {
  const apis = [window.DeviceOrientationEvent, window.DeviceMotionEvent] as unknown as (PermissionApi | undefined)[];
  try {
    const results = await Promise.all(apis.map((api) => (api?.requestPermission ? api.requestPermission() : 'granted')));
    permissionGranted = results.every((r) => r === 'granted');
  } catch {
    // Not from a tap, or refused: the touch fallback still works.
  }
}

/** The screen's rotation from the phone's natural (portrait) orientation: 0, 90, 180 or 270. */
export function screenAngle(): number {
  const angle = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}
