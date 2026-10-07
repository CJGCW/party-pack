// Test bots for playing Word Rush without enough people.
//
//   npm run bot -- <ROOM CODE> [number of bots] [--start]
//
// Each bot solves the word by narrowing down candidates from its guess colours,
// waiting a random 1-4 seconds between guesses. --start makes the first bot start
// the game once all bots have joined (it must be VIP, so use an empty room).
import { io, type Socket } from 'socket.io-client';
import words from 'an-array-of-english-words';
import { WORDLE_RACE, scoreGuess, type WordlePlayerView } from '../shared/games/wordleRace';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol';

const args = process.argv.slice(2);
const code = args.find((a) => /^[a-z]{4}$/i.test(a))?.toUpperCase();
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);
const start = args.includes('--start');
if (!code) {
  console.error('Usage: npm run bot -- <ROOM CODE> [count] [--start]');
  process.exit(1);
}

const url = `http://localhost:${process.env.PORT ?? 3000}`;
const dictionary = words.filter((w) => w.length === 5 && /^[a-z]+$/.test(w)).map((w) => w.toUpperCase());
const NAMES = ['BOT ALEX', 'BOT SAM', 'BOT RILEY', 'BOT CASEY', 'BOT JAMIE', 'BOT MORGAN', 'BOT TAYLOR', 'BOT JORDAN'];

function runBot(name: string, isStarter: boolean) {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url);
  let candidates = dictionary;
  let round = 0;
  let seenGuesses = 0;
  let thinking = false;

  socket.on('game:player', (raw) => {
    const view = raw as WordlePlayerView;
    if (view.round !== round) {
      round = view.round;
      candidates = dictionary;
      seenGuesses = 0;
      thinking = false;
    }
    if (view.guesses.length > seenGuesses) {
      for (const g of view.guesses.slice(seenGuesses)) {
        candidates = candidates.filter((c) => scoreGuess(g.word, c).join() === g.result.join());
      }
      seenGuesses = view.guesses.length;
      thinking = false;
    }
    if (view.phase !== 'playing' || view.solved || thinking || !candidates.length) return;
    thinking = true;
    const word = candidates[Math.floor(Math.random() * candidates.length)];
    setTimeout(() => socket.emit('game:input', { type: 'guess', word }), 1000 + Math.random() * 3000);
  });

  socket.emit('player:join', { code: code!, name, sessionId: `${name}-${Date.now()}` }, (res) => {
    if (!res.ok) {
      console.error(`${name}: ${res.error}`);
      process.exit(1);
    }
    console.log(`${name} joined ${code}`);
    if (isStarter) {
      setTimeout(
        () => socket.emit('room:startGame', { gameId: WORDLE_RACE.id }, (r) => console.log('start:', r)),
        500 + count * 200,
      );
    }
  });
}

NAMES.slice(0, count).forEach((name, i) => setTimeout(() => runBot(name, start && i === 0), i * 200));
