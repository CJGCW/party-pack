import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app: the phone screens, carried inside it, talking to the server over the LAN.
 * `npm run app:build` builds them into dist-app and copies them into android/.
 */
const config: CapacitorConfig = {
  appId: 'com.partypack.phone',
  appName: 'Party Pack',
  webDir: 'dist-app',
  server: {
    // http://localhost still counts as secure (so the motion sensors work), and it can talk to
    // the plain-HTTP server without the mixed-content block an https:// page would hit.
    androidScheme: 'http',
  },
};

export default config;
