// Makes the Unblock Car puzzle bank: random lots, solved with a breadth-first search to find the
// fewest slides each takes; keeps a spread from easy to hard.
//
//   npx tsx scripts/makeUnblockPuzzles.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_ROW, SIZE } from '../shared/games/unblockCar';
import { solve } from '../server/games/unblockCar/solver';

const OUT = join(import.meta.dirname, '..', 'server', 'games', 'unblockCar', 'puzzles.json');
const WANT_PER_DIFFICULTY = 12;
const DIFFICULTIES = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function randomLot(): string {
  const cells = new Array(SIZE * SIZE).fill('.');
  // The red car somewhere on the exit row, short of the exit.
  const redCol = Math.floor(Math.random() * 3);
  cells[EXIT_ROW * SIZE + redCol] = cells[EXIT_ROW * SIZE + redCol + 1] = 'A';
  const count = 9 + Math.floor(Math.random() * 5);
  let id = 66; // 'B'
  for (let tries = 0; tries < 200 && id < 66 + count; tries++) {
    const across = Math.random() < 0.5;
    const length = Math.random() < 0.3 ? 3 : 2;
    const row = Math.floor(Math.random() * (across ? SIZE : SIZE - length + 1));
    const col = Math.floor(Math.random() * (across ? SIZE - length + 1 : SIZE));
    // Nothing else lies across the exit row (it could never get out of the way).
    if (across && row === EXIT_ROW) continue;
    const at = Array.from({ length }, (_, k) => (across ? row * SIZE + col + k : (row + k) * SIZE + col));
    if (at.some((c) => cells[c] !== '.')) continue;
    for (const c of at) cells[c] = String.fromCharCode(id);
    id++;
  }
  return cells.join('');
}

const bank = new Map<number, string[]>(DIFFICULTIES.map((d) => [d, []]));
const started = Date.now();
for (let n = 0; n < 400_000 && Date.now() - started < 240_000; n++) {
  const lot = randomLot();
  const path = solve(lot, 25);
  if (!path) continue;
  const moves = path.length - 1;
  const list = bank.get(moves);
  if (list && list.length < WANT_PER_DIFFICULTY && !list.includes(lot)) list.push(lot);
  if ([...bank.values()].every((l) => l.length >= WANT_PER_DIFFICULTY)) break;
}
const puzzles = [...bank].flatMap(([moves, lots]) => lots.map((lot) => ({ lot, moves })));
writeFileSync(OUT, JSON.stringify(puzzles, null, 0).replace(/},{/g, '},\n{') + '\n');
console.log([...bank].map(([m, l]) => `${m}:${l.length}`).join(' '), `→ ${puzzles.length} puzzles in ${Math.round((Date.now() - started) / 1000)}s`);
