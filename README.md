# Party Pack

A Jackbox-style party game collection for your local network. One computer runs the
server and shows the **host screen** on a TV; everyone plays on their **phone's browser**.
There's nothing to install on the phones.

## Running it

Requires [Node.js](https://nodejs.org) 20.11 or newer.

```bash
npm install
npm run dev      # development, with hot reload
npm start        # production build
```

The server prints two addresses:

- **Host screen:** open `http://localhost:3000/host` on the computer connected to the TV.
- **Players:** phones go to the LAN address shown (e.g. `http://192.168.1.20:3000`), or scan
  the QR code on the host screen, then enter the room code.

Phones must be on the same Wi-Fi as the host computer. The first time it runs, Windows
asks whether Node may accept connections. Allow it on **private** networks.

Phones join over **HTTPS** (port 3443 by default, `HTTPS_PORT` to change it), because phone
browsers only share their motion sensors with secure pages, and WoochaWare's tilt and shake games
need them. The certificate is self-signed, so each phone warns once that the connection isn't
private: tap **Advanced**, then **Proceed** (Android) or **Visit this website** (iPhone). iPhones
also ask to allow motion access when you tap Play (or tap **Turn on motion controls** in the lobby
after a refresh). The certificate is kept in `.certs/` and remade if the computer's address changes.
HTTPS is only needed for WoochaWare. Setting `"woochaware": false` in `party-pack.config.json` (or
`PARTY_PACK_WOOCHAWARE=0`) turns WoochaWare off: it leaves the wheel and the debug picker, phones
join over plain HTTP with no certificate warning, and WoochaWare debug mode is ignored even if it's on.

The join address shown on the TV is this computer's address on your home network. VPN and
virtual-machine adapters (NordVPN, VirtualBox, WSL and so on) are skipped. If it still picks the
wrong one, set `PARTY_PACK_HOST` to the right address (for example `PARTY_PACK_HOST=10.0.0.26`).
The server is only reachable from your own network either way.

The first player to join is the **VIP**. On their phone they choose which games go on the
**wheel**, how many **rounds** to play (1–10), and how many **puzzles per round** (1–10: puzzles in
Letter Drop, words in Word Rush; it applies to every game), then spin it (the host screen has a SPIN!
button too). Each round the wheel picks a game at random. Every game paces the same way: each puzzle ends
with its answer (4s), the last one is followed by the round's scores (4s; skipped when a round
has only one puzzle), then a standings screen counts the running totals up and re-ranks players
as they overtake each other (4s),
before the next spin or the final results. These lengths are in `shared/timing.ts`. Press **Esc** on the host screen to abandon a session.

### Debug mode

For testing a specific game, debug mode replaces the wheel with the old picker: the VIP (or
a click on the host screen) starts one chosen game. Turn it on with either:

- `npm run dev:debug`, or
- `"debugMode": true` in `party-pack.config.json` (an environment variable
  `PARTY_PACK_DEBUG=1`/`0` overrides the file).

### WoochaWare debug

To test WoochaWare's microgames one at a time, turn on WoochaWare debug with `npm run dev:woocha`
or `"woochaDebug": true` in `party-pack.config.json` (`PARTY_PACK_WOOCHA_DEBUG=1`/`0` overrides it).
The VIP's phone then lists only the microgames; tapping one plays it once at each speed level (1, 2, 3),
without scoring, then returns to the list. It takes priority over `debugMode`, but does nothing while `woochaware` is `false`.

## Games

**Scoring.** Every game uses the same scale (`shared/scoring.ts`), so none outweighs the others on
the wheel: each puzzle (a question, word, list, board or stage) is worth up to **1,000 points** to
the best player, and a decent result is around 400–700. Races (Word Rush, Concentration) give 300
for finishing plus up to 700 for speed, less a little per guess.

| Game | Players | How it plays |
| --- | --- | --- |
| **Word Rush** | 1–8 | Everyone races to solve the same Wordle-style word with unlimited guesses before the timer runs out. Solving scores 300, plus up to 700 for the time left, less 8 seconds of it per guess. Guesses don't take time off the clock; they only lower your score. One word per puzzle. **Normal** (2½-minute rounds) uses words with a dictionary definition, shown at the reveal; **Hard** (4-minute rounds) uses obscure words with none. |
| **Letter Drop** | 1–8 | A puzzle board fills in one letter at a time. Buzz in on your phone and type the answer: right scores 750 points; wrong locks you out of that puzzle. |
| **Trivia** | 1–8 | Multiple choice on the TV; everyone answers on their phone within 20 seconds. A right answer scores 500 plus up to 500 more for speed. Trivia, Team Trivia, Pick 'Em and Team Pick 'Em all share one **Trivia** slice on the wheel. Under it, the VIP picks **Competitive** (Trivia or Pick 'Em), **Co-op** (Team Trivia or Team Pick 'Em) or **Both** (either, at random), which topics can come up, and which **formats**: **Questions** (Trivia / Team Trivia) and **Pick 'Em lists** (Pick 'Em / Team Pick 'Em). Each time, one chosen topic is picked at random. With both formats on, it plays Trivia (or Team Trivia) with Pick 'Em lists mixed in: about one question in four is a list (at least one per game), played with Pick 'Em's screens (Team Pick 'Em's in co-op, on a 90-second team clock, where every answer found counts toward the stage and wrong ones cost time, not lives). With one format on, it plays just that. The topics are **General Knowledge** (geography, science, history, nature, sport and more), **Disney & Pixar** (characters, stories and voice actors from the theatrical animated films), **Scrubs** (seasons 1–8), **Brooklyn Nine-Nine** and **Parks and Recreation**. |
| **Team Trivia** | 1–8 | Co-op trivia with the same question banks. The team works through stages (one per puzzle; the final stage needs more): every fully right answer counts toward the stage, and each stage needs about 1.5 correct answers per player. Everyone has 3 lives for the whole challenge; a wrong or missing answer costs one (a partly right select-all answer doesn't count but costs nothing). Out of lives, you're out until you answer one right. If everyone is out, the challenge fails. Points: 150 per correct answer, 400 each per stage cleared, 300 each for completing the challenge. |
| **Pick 'Em** | 1–8 | Long-list trivia, two kinds. **Tap lists:** 9 or 12 options (full rows of three on the TV) with several right answers; tap every one you think is right and lock in (30 seconds). A list is worth up to 1,000, shared among its right answers; each wrong pick costs as much as a right one scores (never below 0), so tapping everything doesn't pay. **Typed lists** (like "name everyone who dies in Romeo and Juliet"): type as many answers as you can in 60 seconds; the list is worth up to 1,000 shared among its answers, and wrong guesses cost nothing. Case, accents, punctuation, a leading "the" and small typos are forgiven. Your answers show only on your phone; the TV shows just how many each player has, then reveals the full list. Lists live in `server/games/pickem/` in the trivia format (typed lists use an `L:` line per answer, with other accepted forms after `\|`); each file is a mode, with the same topics as Trivia (General Knowledge, Disney & Pixar, Scrubs, Brooklyn Nine-Nine, Parks and Recreation). It comes up from the Trivia slice on the wheel, in the **Pick 'Em lists** format. |
| **Team Pick 'Em** | 1–8 | Co-op Pick 'Em with the same lists. The whole party works each list together against one 3-minute clock. Every tap or typed answer counts straight away: a right one lights up on the TV (with who found it) for everyone, a wrong one takes 10 seconds off the clock, and repeating something already tried (right or wrong) costs nothing but says so. Find every answer before the clock runs out. Everyone gets a share of 700 for each answer found (split among the list's answers) and the rest of 1,000 for clearing it. |
| **Rack Attack** | 1–8 | A word-tile game on an 11×11 board. Everyone gets the same part-played board and the same seven tiles, and has one minute to build the best play on their phone (tap a tile, then a square; Shuffle, Recall, and Submit, which shows the score first). Words must be in the dictionary, in one line, and connect to the board; using all seven tiles adds 50. Each play scores its share of the best play possible (the best play is worth 1,000), and the reveal shows that best play. One board per puzzle. |
| **Clue Crew** | 2–8 | A co-op word-clue game in the style of two-player clue games, for the whole room. Everyone sees the same 25 words, but each phone shows a secret key: your green targets and red traps. Players take turns giving a one-word clue and a number; everyone else votes on the words they think it means (the most votes wins, ties at random). A target is found and the team can keep going, up to the number plus one; a word that isn't the clue-giver's ends the turn, and one of their traps ends the game. Find every target before everyone has had their turns (one turn each per round). Clues can't be, contain, or sit inside a board word. Everyone shares up to 700 a round for the words found (split among them), the clue-giver gets 50 more per word, and finding them all adds 300 a round. |
| **Concentration** | 1–8 | A race to find pairs. Everyone gets the same face-down board of playing cards on their phone (4 by 4 by default; change `GRID_SIZE` in `shared/games/concentration.ts`, 2 to 10, and an odd size leaves the centre empty). Tap two cards: a pair stays face up, anything else turns back over. Like Word Rush, clearing the board scores 300, plus up to 700 for the time left, less 1.5 seconds of it per guess (a pair of flips); running out of time scores a little for each pair found. The TV shows each player's matched squares and guesses, never the cards. One board per puzzle. |
| **Blockbusters** | 2–8 | Two teams race across a board of lettered hexagons, as on the game show (no Gold Rush). Red links the top and bottom edges, White the left and right. With an even number of players the teams are equal and the board is 4 by 4; with an odd number Red is the smaller team and the board is the show's 5 wide by 4 high, so Red needs 4 hexagons and White 5. The team in control picks a letter on their phones; the question's answer starts with that letter. Anyone can buzz; the buzzer types the answer (case, accents, small typos, a leading "The" and a name's surname alone are all fine). Right takes the hexagon and the next pick; wrong locks that team out and the other team can buzz; if nobody gets it, a new question on the same letter. 100 points per right answer and 500 to everyone on a team that wins a board. Questions come from the Trivia banks, so it has the same topics, on one wheel slice. One board per puzzle. |
| **WoochaWare** | 1–8 | WarioWare-style microgames (35 of them, in `client/play/woochaware/`): 25 played on the touch screen and 10 by tilting, turning or gently shaking the phone (Road Trip is held sideways). Without motion sensors those 10 work by dragging instead. Each puzzle is a stage of 5 microgames, a few seconds each; every win scores 200. The speed level rises from 1 to 3 over the game. |

### Testing with bots

To test without enough people, add bot players that really play (they solve the word
using their guess colours):

```bash
npm run bot -- ABCD 3 --start
```

This adds 3 bots to room `ABCD`. `--start` makes a bot start the game, which only works
if the bots joined an empty room so one of them is the VIP. Outside debug mode it sets the wheel
to Word Rush only (the one game bots can play) for a single round. Add `--hard` for hard mode.

### Letter Drop puzzles

Puzzles live in `server/games/puzzles.txt`, one per line as `CATEGORY | PUZZLE`. Add your own;
each must fit a 4 × 14 board. Puzzles are dealt from a shuffled deck, so none repeat until all have
been used. Answers are checked on letters only (spacing, punctuation and `&`/`AND` don't matter).
The point value and timings are at the top of `server/games/tossUp.ts`.

### Trivia questions

Each question bank is a text file in `server/games/trivia/` (one mode per file, e.g. `disney-pixar.txt`). Banks about TV shows use
`TOPIC:` instead of `FILM:` for the banner above each question. Questions look like:

```
FILM: The Lion King (1994)

Q: Who voiced adult Simba?
A: Matthew Broderick
W: Jonathan Taylor Thomas
W: Nathan Lane
W: Jeremy Irons
```

`A` is the right answer and the three `W`s are wrong ones; answer order is shuffled each time.
Give a question more than one `A` (still four options in total) to make it **select all that apply**:
players toggle answers and lock in, and score the share of right answers they picked minus the share
of wrong ones they picked (never below 0), so picking every option scores nothing unless they're all right. The
Disney & Pixar bank covers the theatrical Disney and Pixar animated features except direct-to-video
or streaming sequels, live action, Song of the South, Toy Story 4 and Lightyear, plus Hook (1991) as a
house exception; its facts were checked against Wikipedia. It also has "Across the Films" questions that compare
characters, villains, voice actors and stories between films.
To add a new bank, add a `.txt` file and a matching mode in `shared/games/trivia.ts`.

### Word Rush word list

Any 5-letter English word (from `an-array-of-english-words`) is accepted as a guess and can be a
secret answer. Offensive words are filtered out of the answers using two maintained lists
(`obscenity` and `naughty-words`). If an inappropriate word slips through, add it to
`EXTRA_BLOCKED` in `server/games/words.ts`. If an innocent word is wrongly blocked, add it to
`ALLOWED`.

When a word is revealed, its definition is shown from WordNet (`wordnet-db`), an offline
dictionary, so no internet is needed. WordNet defines about half the 5-letter words
(names like PARIS don't count). Normal mode only picks words it can define; Hard mode only
picks the ones it can't.

## Project layout

```
server/            Node + Express + Socket.IO (authoritative game logic)
  index.ts         HTTP/socket entry point; serves the client through Vite in dev
  rooms.ts         Rooms, players, VIP, reconnects, starting/ending games
  games/           One file per mini game, plus the registry (games/index.ts)
shared/            Types shared by server and clients
  protocol.ts      Socket events, room/player types
  games/           Per-game view and input types
client/
  host/            Phaser host screen: one scene per mini game
  play/            Phone controller (plain DOM): one controller per mini game
```

The server is authoritative: secret information (such as the Word Rush answer) never
leaves the server until it should be revealed. Each mini game sends a **host view** to the
TV and a separate **player view** to each phone.

## Adding a mini game

1. **Shared types**: add `shared/games/<game>.ts` with a `GameInfo` (including at least one
   entry in `modes`; the lobby shows a start button per mode) plus host view, player view and
   input types.
2. **Server logic**: add `server/games/<game>.ts` implementing `MiniGame` (see
   `server/games/MiniGame.ts`), then register it in `server/games/index.ts`.
3. **Host scene**: add a Phaser scene in `client/host/scenes/`, then register it in
   `client/host/main.ts` (`GAME_SCENES` and `game.scene.add`).
4. **Phone controller**: add `client/play/games/<game>.ts` returning a `Controller`, then
   register it in `CONTROLLERS` in `client/play/main.ts`.
