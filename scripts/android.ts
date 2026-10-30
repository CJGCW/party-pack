// Runs a Gradle task on the Android app (android/), finding Android Studio's Java and SDK.
//
//   npm run app:apk        (builds the phone screens, then: tsx scripts/android.ts assembleDebug)
//
// JAVA_HOME and ANDROID_HOME win if they're set; otherwise it looks where Android Studio
// puts them by default.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const androidDir = resolve(import.meta.dirname, '..', 'android');
const windows = process.platform === 'win32';
const env = { ...process.env };

const javaHomes = windows
  ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')]
  : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/opt/android-studio/jbr', join(homedir(), 'android-studio', 'jbr')];
const sdks = windows
  ? [join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk')]
  : [join(homedir(), 'Library', 'Android', 'sdk'), join(homedir(), 'Android', 'Sdk')];

env.JAVA_HOME ||= javaHomes.find(existsSync);
env.ANDROID_HOME ||= env.ANDROID_SDK_ROOT || sdks.find(existsSync);
if (!env.JAVA_HOME || !env.ANDROID_HOME) {
  console.error("Couldn't find Android Studio's Java or the Android SDK. Install Android Studio and run its setup once,");
  console.error('or set JAVA_HOME and ANDROID_HOME.');
  process.exit(1);
}

const tasks = process.argv.slice(2);
const result = spawnSync(join(androidDir, windows ? 'gradlew.bat' : 'gradlew'), tasks.length ? tasks : ['assembleDebug'], {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: windows,
});
if (!result.error && result.status === 0 && tasks.includes('assembleDebug')) {
  console.log(`\nAPK: ${join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')}`);
}
process.exit(result.status ?? 1);
