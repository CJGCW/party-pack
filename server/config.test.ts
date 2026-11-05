import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { MAX_EXTERNAL_GAMES } from '../shared/games/external';
import { configuredExternalGames } from './config';

const dir = mkdtempSync(join(tmpdir(), 'party-pack-config-'));
const file = join(dir, 'config.json');
after(() => rmSync(dir, { recursive: true, force: true }));
const withFile = (text: string) => {
  writeFileSync(file, text);
  return configuredExternalGames(file);
};

describe('Other games in the config file', () => {
  it('reads the list, tidied as the lobby tidies it', () => {
    assert.deepEqual(withFile(JSON.stringify({ externalGames: ['Charades', '  Uno  ', 'charades', ''] })), ['Charades', 'Uno']);
  });

  it('keeps to the limit', () => {
    const names = Array.from({ length: MAX_EXTERNAL_GAMES + 5 }, (_, i) => `Game ${i}`);
    assert.equal(withFile(JSON.stringify({ externalGames: names })).length, MAX_EXTERNAL_GAMES);
  });

  it('reads the file afresh each time', () => {
    assert.deepEqual(withFile(JSON.stringify({ externalGames: ['Uno'] })), ['Uno']);
    assert.deepEqual(withFile(JSON.stringify({ externalGames: ['Chess'] })), ['Chess']);
  });

  it('starts empty with no list, a missing file, or a broken one', () => {
    assert.deepEqual(withFile('{}'), []);
    assert.deepEqual(configuredExternalGames(join(dir, 'nothing.json')), []);
    assert.deepEqual(withFile('{ not json'), []);
    assert.deepEqual(withFile(JSON.stringify({ externalGames: 'Uno' })), []);
    assert.deepEqual(withFile(JSON.stringify({ externalGames: ['Uno', 3] })), []);
  });
});
