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

Blockbusters themes are off for now (`"blockbustersThemes": false`, or `PARTY_PACK_BLOCKBUSTERS_THEMES=0`):
Blockbusters plays General Knowledge only, as a plain slice on the wheel. Turned on, every question
file in `server/games/blockbusters/` becomes a topic to choose under its slice.

The join address shown on the TV is this computer's address on your home network. VPN and
virtual-machine adapters (NordVPN, VirtualBox, WSL and so on) are skipped. If it still picks the
wrong one, set `PARTY_PACK_HOST` to the right address (for example `PARTY_PACK_HOST=10.0.0.26`).
The server is only reachable from your own network either way.

The first player to join is the **VIP**. On their phone they choose which games go on the
**wheel**, how many **rounds** to play (1–10), and how many **puzzles per round** (1–10: puzzles in
Letter Drop, words in Word Rush; it applies to every game), then spin it (the host screen has a SPIN!
button too). Each round the wheel shows up to 8 of the chosen games, pulled at random (a fresh handful
every spin, so a long list doesn't crowd it), and lands on one. Every game paces the same way: each puzzle ends
with its answer (4s), the last one is followed by the round's scores (4s; skipped when a round
has only one puzzle), then a standings screen counts the running totals up and re-ranks players
as they overtake each other (4s),
before the next spin or the final results. These lengths are in `shared/timing.ts`. Press **Esc** on the host screen to abandon a session.

In the question games (Trivia, Team Trivia, Pick 'Em, Team Pick 'Em and Blockbusters) the VIP's phone
has a **Flag this question** box. Ticking it saves the question on screen, with its answers, game and
topic, to `flagged-questions.jsonl` in the project folder (one JSON object per line; git-ignored) for
review; unticking it takes it back out. A game reports each question with `ctx.showingQuestion(...)`,
and the answers only go to that file, never to the phones.

In the trivia and word games, phones have an **I give up** button at the bottom. Holding it down for
1.5 seconds fills it up and forfeits the puzzle (letting go early drains it away). What that means depends on the game:

- **Word Rush, Rack Attack, Longest Word, Pick 'Em:** you're done with this puzzle, scoring nothing for it (a typed Pick 'Em list
  keeps what you'd found).
- **Trivia:** no answer. In Team Trivia that costs a life, as a missed answer does.
- **Letter Drop:** you're out of this puzzle, as after a wrong answer.
- **Team Pick 'Em:** you stop playing this list.
- **Blockbusters:** the buzzer giving up counts as a wrong answer. Before anyone buzzes, you sit the question out,
  and once your whole team has, the other team gets it to themselves.
- **Clue Crew:** the clue-giver skips their turn. Voters already have Stop.

The game's screen greys out until the next puzzle, and the puzzle ends early once everyone has answered,
finished or given up. A game offers it through its player view (`canGiveUp`, `gaveUp`; see `GiveUpView` in
`shared/protocol.ts`) and handles it in `giveUp(playerId)`; the phone shows the button for every game alike.

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

### Android app

The phone screens can also be installed as an Android app (made with [Capacitor](https://capacitorjs.com),
in `android/`). Players can mix the app and the browser in the same game. The app carries the phone
screens inside it and only exchanges game data with the server, so:

- it needs no HTTPS: WoochaWare's motion sensors work over plain HTTP, with no certificate warning;
- it keeps the screen awake while it's open;
- the first time, it asks for the server's address (the one on the TV; just the numbers before the
  colon are enough) and remembers it. "Server: …" under the join form changes it.

Building it needs Android Studio, set up once (its first run downloads the Android SDK). `scripts/android.ts` finds its
Java and SDK, so nothing else needs setting:

- `npm run app:build` builds the phone screens into `dist-app/` and copies them into `android/`.
- `npm run app:install` does that, then installs it on a phone plugged in over USB (with USB debugging on).
- `npm run app:apk` does that, then builds `android/app/build/outputs/apk/debug/app-debug.apk`, which can
  be copied to a phone and installed (allow "install unknown apps" for whatever opens it, then turn that back off).

Changes to the phone screens need a rebuild and reinstall. Changes to the server, the TV or the question lists don't.
Add-on games in `local/` go into the app too, since it's built from this folder (and `dist-app/` is git-ignored).

## Games

**Other games.** Under **Other games** in the lobby, the VIP can list games you play away from the
app (board games, cards, charades…), separated by commas or new lines (up to 20). Each gets its
own slice on the wheel; when one comes up, the TV and phones show what to play and how long it's
been going, and the app waits until the VIP taps **We're finished** on their phone, then taps who
won (one button per player; any number, or nobody) and **Done**. Each winner scores 1,000 per
puzzle in the "puzzles per round" setting (what an app game's best player can get in a round),
so the round counts in the standings like any other, and its winners and losers play any game
that's played after rounds. The list is saved when the VIP taps away from the box, and with other games listed the
app's own games can all be turned off. (`shared/games/external.ts`, `server/games/external.ts`.)

**Calling a round.** A game played after rounds (`GameInfo.afterRounds`) can be *callable*
(`GameInfo.calls`): then it isn't played after every round, only after a round a player calls
it for. Once the wheel stops, phones with calls left get a button for each option (plus **No
thanks**) for 10 seconds, or until everyone who can has decided; the TV lists the calls as they
come in. Each option can be called once a round, and each call uses up one of the caller's calls
for the session (`CallInfo.perPlayer`, or the game's `callsPerPlayer()`). The game gets what was
called as `GameOptions.calls`.

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
| **Longest Word** | 1–8 | A letters round in the style of the long-running TV word show. One player picks nine letters on their phone, a vowel or a consonant at a time (at least 3 vowels and 4 consonants; 10 seconds a letter or one is picked for them); the picker moves round the players each word. The letters come off shuffled vowel and consonant piles (`server/games/longestWord/letters.ts`). Then everyone has 30 seconds to spell the longest word they can by tapping the letters, each used once. Whatever you've spelt when time runs out counts, or lock it in early. Words must be in the dictionary, which isn't checked until the reveal. Each word scores its share of the longest word the letters make (the longest is worth 1,000; one half as long, 500), and the reveal shows the longest words with a definition. One word per puzzle. |
| **Peg Drop** | 1–8 | A ball-and-pegs game on the TV. Players take turns aiming the launcher at the top by turning their phone like a steering wheel (lying flat, tilt it left and right; without motion sensors, drag on the dial), then tap Fire (or it fires by itself after 20 seconds). The ball bounces down through the pegs: blue pegs score 10, gold pegs 100, and hit pegs clear once the ball's gone (or early, if the ball gets stuck on them). Every peg's points multiply as the gold pegs get cleared (×2 at 40%, ×3 at 65%, ×5 at 85%), and hitting the last gold peg ends the board with a 1,000 bonus (multiplied); that shot plays in slow motion, zoomed in on the ball, before the board-cleared celebration. A bucket slides to and fro along the bottom the whole time, not just during shots, so you can time your shot for it: land in it for a free ball. The VIP picks the shots each player gets per board in the lobby: 3, 5, 8 or 10, or Auto (12 ÷ players, at least 3). Shots are worked out on the server and played back on the TV. At the end of a board the top scorer gets 1,000 and everyone else their share of that. Layouts are random from six patterns (`server/games/pegDrop/layouts.ts`). Motion sensors need HTTPS in a phone's browser (on whenever WoochaWare is) or the Android app. One board per puzzle. |
| **Maze Race** | 1–8 | Everyone gets the same randomly generated maze on their own phone (`server/games/mazeRace/generate.ts`: long winding corridors with a few loops) and races from the top corner to the exit, 90 seconds a maze after a 3-second countdown. Put a finger down anywhere and drag: the dot follows it as far as it moves, along the corridors, held up by walls. To turn, drag toward the opening (you can start just before you reach it); drifting a little sideways while going along doesn't take a turning. Arrow keys slide to the next turning. The phone moves straight away and the server checks every step. The TV shows the maze and how close each player is to the exit, then at the reveal draws everyone's trail over the shortest way through. Getting out scores like a Word Rush word (300, plus up to 700 for time left); anyone still inside scores up to 300 for how close they got. One maze per puzzle. |
| **Spiral Shot** | 1–8 | A marble shooter, a board each side by side on the TV. A chain of coloured marbles rolls along a track toward a hole, speeding up as the round goes on; everyone's on the same track with a chain in the same colours. Each round picks a track at random, a different one from the last: Spiral, Flower, Snake or Square (`TRACKS` in `shared/games/spiralShot.ts`; each has a pace setting, evened out by playing them through, and longer tracks roll faster so each fills in about the same time). Turn your phone like a steering wheel to turn your turret (a quarter turn each way aims all round; lying flat, tilt it; without motion sensors, point at the dial), and it fires a marble by itself every second. Tap the dial (or Swap) to swap the marble in the turret with the next one. A marble joins the chain where it hits, and three or more of a colour touching pop; a gap with matching marbles either side pulls shut, which can pop again (a chain reaction). The chain reaching the hole puts you out. Each round is 90 seconds: everyone who survives it scores the full 1,000; going out earlier scores up to 700 by how long you lasted, so the last one standing beats everyone who went before them. The pace and the turret's rate of fire are at the top of `shared/games/spiralShot.ts`. Motion sensors need HTTPS in a phone's browser (on whenever WoochaWare is) or the Android app. One round per puzzle. |
| **Star Splat** | 1–8 | A hidden-pattern puzzle. Everyone gets the same brick wall with eight star targets (two with 1 star, four with 2 and two with 3: 16 stars) on their phone, and a launcher: pick a ball's colour and shape (and from Hard up, the shape's colour) and throw. A ball's features decide which brick it hits, by a rule that's new every wall: each feature picks the row, the column or (from Hard up, on a wall of five sections) the section, each value to its own place. On Medium and Very hard the column also moves one along for each row down. Every throw stays on your wall to work the rule out from. Easy and Medium walls are 5 × 5; Hard and Very hard 25 × 5. Balls and time per wall go up with the level (13 to 16 balls, 2 to 3½ minutes). Stars show as outlines that fill in as they're hit, on the phone and on each player's card on the TV. Nobody's throws show on the TV until the reveal, which shows the ball that hits each star (the rule itself is never spelt out). Each star is worth a share of 850; filling all 16 adds up to 150 more for time left. The VIP picks the difficulty in the lobby: Rising (Easy first, a level harder each wall) or a fixed level. One wall per puzzle. |
| **Cave Flyer** | 1–8 | A side-by-side boards game: everyone flies their own copter through the same cave (from the round's seed), each in a window on the TV. Hold the pad on your phone (or the space bar) to climb; let go to drop. The cave scrolls faster as the round goes on, its gap narrows, and blocks stand in the way (always with a way past). A copter hovers at the start until its player first holds, or for 2 seconds. Touching the roof, the floor or a block is a crash. 75-second rounds, scored by survival: everyone still flying at the end scores 1,000; crashing earlier scores up to 700 by how long you lasted. Pace and handling are at the top of `shared/games/caveFlyer.ts`. |
| **Stacker** | 1–8 | A side-by-side boards game: a row of blocks slides back and forth over your tower; tap to drop it. What lands on the row below stays, the overhang falls off, and missing it altogether topples the tower. The row slides faster the higher you get. Your tower's on your phone as well as the TV, so taps are timed exactly: the phone sends where it saw the row, and the server accepts it if the row was really there within the last half second. 60-second rounds; the tallest tower scores 1,000 and everyone else their share of that. |
| **Tile Tilt** | 1–8 | A side-by-side boards game: everyone's frame of 64 face-down tiles, with a shell resting in the middle. Hold your phone flat like a tray and tip it to roll the shell (without motion sensors, drag on the level); every tile it rolls over flips and shows part of a hidden picture (original drawings, the same for everyone that round). First to flip every tile wins: 60-second rounds scored as a race (300 for finishing plus up to 700 for time left; anyone who doesn't finish scores up to 300 for how many they flipped). |
| **Tempest Run** | 1–8 | A side-by-side boards game: turn your phone like a steering wheel to slide round the rim of a tube (a quarter turn each way reaches the far side) while hazards climb the lanes toward you; be in a clear lane when one arrives. The tube changes each round: circle, square, star or an open fan you can't go round. Everyone gets the same hazards (from the round's seed), coming faster as the round goes on, never filling more than 40% of the lanes at once. 90-second rounds, scored by survival. |
| **Helix Drop** | 1–8 | A side-by-side boards game: a ball bounces on a tower of rings; turn your phone to spin the tower so it drops through each ring's gap. Landing on red sends you back to the last checkpoint ring after a moment. Rings come from the round's seed, with more red further down (never right beside a gap). Deepest in 60 seconds scores 1,000, everyone else their share. |
| **Sky Hop** | 1–8 | A side-by-side boards game: bounce up and up on platforms, steering left and right by turning your phone (off one side brings you on at the other). Some platforms move, cracked ones break under you, springs launch you; the way up is always within a jump. Falling off the bottom puts you back on the last checkpoint after a moment. Highest in 60 seconds scores 1,000, everyone else their share. |
| **Snow Chase** | 1–8 | A side-by-side boards game: ski down the same slope (from the round's seed), steering by turning your phone; straight down is fastest. Trees stop you for a second; gates count. After 60 seconds a snow beast comes after you, a bit slower than skiing straight down, so clean skiing outruns it and every crash or wide turn lets it gain. Being caught ends your run. 90-second rounds, scored by survival. |
| **Road Hop** | 1–8 | A side-by-side boards game: tap the pad to hop forward, swipe to hop left, right or back (arrow keys work too). Cross roads, rivers on logs and railway lines; cars, logs and trains move on a fixed schedule from the round's clock, so everyone faces the same. Getting hit or falling in sends you back to the last grass after a moment. Furthest in 60 seconds scores 1,000, everyone else their share. |
| **Poppit** | 1–8 | A side-by-side boards game with the board on your phone: everyone gets the same balloons (four colours, some holding gifts). Tap a bunch of two or more touching balloons of one colour to see what it's worth, tap again to pop it (a bunch of n scores n × (n − 1), gifts extra, clearing the board a bonus). Balloons float up to fill the gaps and empty columns close up to the left. A board's done when no pair is left. Best score in 90 seconds scores 1,000, everyone else their share. Duel mode is the same, but a pop of 8 or more sends stones, half its size, to a rival: they float in under the balloons as there is room, and can never be popped. |
| **Unblock Car** | 1–8 | A side-by-side boards game with the board on your phone: drag cars and trucks along their length to clear a way for the red car out of the exit. A round is a chain of ten lots getting harder, the same for everyone, from a bank made by `scripts/makeUnblockPuzzles.ts` (random lots solved breadth first, so each one's fewest slides is known). Each lot solved scores 100, less 8 for every slide over the fewest (at least 40). Most points in 90 seconds scores 1,000, everyone else their share. |
| **Mine Dash** | 1–8 | A side-by-side boards game with the board on your phone: everyone clears the same minefield (9 × 12, 18 mines), starting with the same opening uncovered. Tap to uncover, hold (or Flag mode) to flag; the server holds the mines. Hitting one locks your board for 10 seconds. Scored as a race: first to uncover every safe square, with points for time left; anyone who doesn't finish scores for how much they uncovered. Every mine shows at the result. Turns mode is one shared field (21 mines) on the TV: take turns to tap it, 15 seconds a turn. A mine is yours and you go again; a safe square passes the turn. It ends when the leader can't be caught, and each player scores their share of the mines found. |
| **Pipe Flow** | 1–8 | A side-by-side boards game with the board on your phone: everyone gets the same grid, tap and queue of pipe pieces (straights, corners and crossings). Tap a square to lay the next piece; laying over a dry piece swaps it but locks you for 1.5 seconds. The water starts 20 seconds in and fills a square every 2 seconds, speeding up to 1; it goes straight through a crossing (which can be filled once each way) and spills where the pipe ends, which ends your run. Longest flow in 90 seconds scores 1,000, everyone else their share. |
| **Light Trails** | 1–8 | A shared arena game: everyone rides a bike on one grid on the TV, leaving a wall of light behind. Swipe on your phone (or use the arrow keys), or switch on Steer and turn the phone like a wheel, to turn; a quick second swipe queues a second turn. Hit any wall, trail or rider and you're out. From 50 seconds the walls close in. Last one riding wins; scored by survival (out last scores most). |
| **Bump Ring** | 1–8 | A shared arena game: everyone rides a ball on a round platform. Tilt your phone to roll (or drag on the level without motion sensors) and ram rivals off the edge; bumps bounce a little harder than they hit. From 35 seconds the edge crumbles in. Last one on wins; scored by survival. |
| **Hexagon Heat** | 1–8 | A shared arena game on a floor of coloured tiles (squares or hexes, by round). A colour is called, then every other tile drops away for a moment; tilt your phone to roll onto the called colour in time. The calls come faster as the round goes on. Last one standing wins; scored by survival. |
| **Fruit Rush** | 1–8 | A shared arena game: fruit falls into a yard (a shadow shows where), and everyone tilts their phone to roll about and grab it. Every ninth piece is gold and worth 5. Ram someone hard enough and two of their fruit spill out for anyone to take. Most fruit in 60 seconds scores 1,000, everyone else their share. |
| **Sky Joust** | 1–8 | A shared arena game: fly round a cave of ledges over lava. Turn your phone like a steering wheel to fly left and right (or drag on the dial) and tap FLAP to climb; the cave wraps round at the sides. Crash into a rival from above and they lose a life; level crashes just bounce apart; the lava costs a life too. Three lives each, with a moment's safety after coming back. Last flyer wins; scored by survival. |
| **Keep Guard** | 1–8 | A shared arena game: everyone's keep sits on the rim of a round arena (two face each other; more go evenly round), behind two rings of bricks, with a shield to swing round it by turning your phone. Balls bounce about, smashing bricks; one that reaches your keep knocks you out, leaving rubble behind. A new ball comes in every 15 seconds, and they all speed up. Last keep standing wins; scored by survival. |
| **Blast Grid** | 1–8 | A shared arena game in a yard of pillars and crates (13 × 11, or 17 × 13 for five or more). Drag the stick on your phone to walk (arrow keys work too) and tap BOMB (or space): it goes off after 2.4 seconds in a cross, smashing the first crate each way and catching anyone in it, and sets off other bombs it reaches. Crates can hide power-ups: another bomb, a bigger blast or more speed. From 75 seconds, blocks fall in from the edge, spiralling in. Last one standing wins; scored by survival. |
| **Tank Yard** | 1–8 | A shared arena game: top-down tanks in a walled yard (one of three layouts, by round). Drag the stick the way you want to go and your tank turns and drives; tap FIRE to shoot straight ahead (up to three shells out at once). Shells bounce once off walls, and can hit you too once they have. Three hits and you're out. Last tank rolling wins; scored by survival. **Gravity** mode is a volleys game instead: everyone's tank sits on a planet in one shared bit of space. Each volley, everyone aims at once (point at the dial or turn the phone, hold FIRE to charge, let go to fire); then all the shells fly together, curving round the planets, and blasts hurt every tank near them. Four volleys a round; most damage dealt to others scores 1,000, everyone else their share. Both mode alternates Arena and Gravity, round by round. |
| **Bubble Brawl** | 1–8 | A side-by-side boards game with garbage: everyone starts with the same cluster of coloured bubbles hanging from the ceiling. Turn your phone to aim (or drag on the dial), tap FIRE to shoot and SWAP to swap with the next bubble. Three or more of a colour pop, and anything left hanging drops, and every bubble you drop lands on a rival's board after their next shot (taking turns round the rivals still in). The ceiling comes down a row every 15 seconds; a bubble past the line puts you out. Last one standing wins; scored by survival. |
| **Gem Rush** | 1–8 | A side-by-side boards game with the board on your phone: everyone gets the same 8 × 8 board of gems (six kinds, each its own shape and colour), and new gems fall in in the same order. Swipe a gem to swap it with a neighbour (or tap one, then the other); the swap must make a line of three or more. Lines clear, the gems above fall, and new lines from that score more each step of the chain; lines of four and five score extra. If no move is left, the board shuffles. **Score Attack:** most points in 90 seconds. **Battle:** chains and long lines also turn gems near the top of a rival's board into stones, which can't be moved and only break when a line clears next to one. Both score 1,000 for the best, everyone else their share. |
| **Brick Bash** | 1–8 | A side-by-side boards game: everyone gets the same wall of bricks (the top rows take two hits). Turn your phone to slide your paddle (or drag on the dial); the ball comes off at an angle by where it hits, and speeds up as the round goes on. Lose the ball and the next comes after 3 seconds. Clearing the wall ends your run with a brick's worth of bonus for every second left. **Garbage** mode: every 5 bricks you smash pushes a rival's wall down a row, and a wall that reaches the line ends that run. Most bricks in 90 seconds scores 1,000, everyone else their share. |
| **Castle Crush** | 1–8 | A volleys game: everyone gets their own copy of the same castle (bays of wooden pillars and slabs up to four floors, with crowned guards inside), behind a hill. Each shot, everyone aims at once: turn your phone to raise or lower the catapult (or point at the dial), pull down on the pad to set the power and let go to fire. When everyone's fired (or after 20 seconds) the server works out every shot with real physics (planck.js) and the TV plays them all back side by side. Three shots a round; each block knocked over scores 10 and each guard toppled 50. Most damage scores 1,000, everyone else their share. |
| **Strike Zone** | 1–8 | A volleys game: everyone bowls at once, each on their own lane (shown on its side on the TV). Drag the ball sideways on your phone to line it up, then flick it up the lane: a faster flick bowls harder, and a flick that curves puts spin on it, hooking the ball. Three frames of two balls (a strike sits the second out); a strike adds 10 bonus pins and a spare 5. Most pins scores 1,000, everyone else their share. |
| **Idol Tower** | 1–8 | A side-by-side boards game with the tower on your phone: everyone gets the same tower (one of four, by round) with a golden idol on top. Tap a wooden block to knock it out; the server settles the tower with real physics and it plays back on your phone and the TV. Stone stays put. If the idol touches the ground, the tower resets and you wait 3 seconds. Scored as a race: first to knock out every wooden block, with points for time left. |
| **Ink Run** | 1–8 | A physics puzzle race with the level on your phone: a ball, some ground and a flag (one of three levels, by round). Draw with your finger and the stroke becomes a solid thing that drops into place (ink is limited; you can't draw through the ground or the ball). Tap Run to let the ball roll; Retry puts it back with your drawings, Clear wipes them. First to get the ball to the flag wins. |
| **Gizmo Goal** | 1–8 | A physics puzzle race with the level on your phone: place the parts you're given (planks you can turn, bouncy bumpers, fans that blow upwards) to steer the ball to the flag, then tap Run. Retry puts the ball back so you can move things. Three levels, one a round. First to the flag wins. |
| **Snatch** | 1–8 | A reaction game: a cover lifts over the golden treasure, or now and then a trap. Tap first when it's the treasure to grab it; tapping before it lifts, or on a trap, locks you out of that grab. The lift is set on the server's clock ahead of time, so every phone and the TV show it at the same moment, and taps carry the time they were made, so a slow connection doesn't cost anyone (the server waits a moment after the first good tap for any earlier one still on its way). Seven grabs a round; most grabs scores 1,000, everyone else their share. |
| **Rock Solid** | 1–8 | A side-by-side boards game: the same rocks drop on everyone's blob, faster as the round goes on. Hold the pad to turn to stone and they bounce off, but being stone uses up energy, and once it's gone you're soft until you let go. A rock on a soft blob costs a heart; three hearts each. Last one standing wins; scored by survival. |
| **Flag Signal** | 1–8 | A memory game, everyone in step: the referee on the TV waves a sequence of flags (up, down, left, right), then everyone swipes it back on their phone in time. Each level the sequence is one longer and a little quicker. A wrong swipe, or not finishing in time, puts you out. Last one standing wins; scored by survival. |
| **Wind-Up Race** | 1–8 | A volleys game, one volley a round: for 10 seconds, circle your finger round the key on your phone to wind your toy (faster circles store up to twice as much; the server caps what's humanly possible). Then all the toys let go and walk on the TV. Farthest scores 1,000, everyone else their share. |
| **Power Beat** | 1–8 | A side-by-side boards game: tap in time with the beat to make power. Within 70ms of the beat is perfect, within 150ms good, anything else a little; every eight good taps in a row adds a bonus; mashing overloads you for 2 seconds. The beat runs on the server's clock (phones and TV pulse together) and taps are judged by when they were made. The tempo rises each round. Most power in 45 seconds scores 1,000, everyone else their share. |
| **Pop Chain** | 1–8 | A volleys game: everyone gets the same field of drifting dots (worked out from the seed, so phone, server and TV agree). Tap once, at the spot and moment you choose, to set off a blast: any dot it touches blasts too, and so on in a chain. When everyone's tapped, the TV plays every chain back. Three fields a round, each fuller; most dots popped scores 1,000, everyone else their share. |
| **Head Ball** | 1–8 | A side-by-side boards game: the same balls and boots come flying in at everyone. Tip your phone left and right (or drag) to run and get your head under the balls; a boot to the head stuns you for 2 seconds. Most balls headed in 60 seconds scores 1,000, everyone else their share. |
| **Moon Drop** | 1–8 | A shared arena game: everyone drops onto the same moon at once (the landers pass through each other). Turn your phone to tilt your lander and hold THRUST to push against the way it points. Land on a pad slowly and upright: the pads are worth x2, x3 and x5 (the smaller, the more), plus points for a soft landing and fuel left. Crash and you score nothing. Best landing scores 1,000, everyone else their share. |
| **Dodge Box** | 1–8 | A side-by-side boards game: steer your square with the thumb stick (so your finger never covers it) from the start to the goal, picking up every coin on the way, past dots on patrol. Touch a dot and you're back at the start (or the last checkpoint). The square and dots touch a little less than they look, to be fair to fingers. Three hand-made levels, one a round. Scored as a race. |
| **Bar Dash** | 1–8 | A side-by-side boards game: customers walk down four bars towards you (the same ones for everyone). Tap a bar on your phone to dash there and slide a drink down; each customer served sends their empty glass back, so be at that bar to catch it. A customer reaching your end, a dropped glass or a drink sliding off an empty bar costs a life; three each. Most customers served scores 1,000, everyone else their share. |
| **Ball Count** | 1–8 | A volleys game: there are balls rolling about inside your phone. Tilt it (or drag on the box) and feel each one knock against the sides: a buzz on phones that can, a click on those that can't. Then guess how many. Three boxes a round; a guess scores 100 spot on, less in proportion for each ball off. The TV opens each box with everyone's guesses. Best total scores 1,000, everyone else their share. |
| **Crowd Spot** | 1–8 | A volleys game, one find a volley: a crowd of little characters (made of parts: skin, hat, glasses, mouth) drifts across the TV and every phone, the same crowd in the same places (on the server's clock). Each find asks for the odd one out, or the one with a particular hat and glasses; tap them on your phone. A wrong tap locks you out for 3 seconds. A find scores 100 plus up to 100 for speed. Five finds a round; best total scores 1,000, everyone else their share. |
| **Face Fix** | 1–8 | A volleys game, one face a volley: the TV shows a cartoon face; yours starts all wrong. Drag the eyes (up, down and apart), nose and mouth into place and stretch the face with the sliders, then lock it in. The match is scored by how far each part is off. The TV shows each attempt over the target. Three faces a round; best total scores 1,000, everyone else their share. |
| **Sketch It** | 2–8 | Turns go round: the artist gets a word (from a list of easy, family-friendly things) and draws it on their phone, with colours, sizes and Clear; the strokes appear on the TV as they're drawn. Everyone else types guesses on their phone, matched forgivingly (as Pick 'Em's typed answers); halfway through, the first letter shows. A right guess scores 100 plus up to 150 for speed; the artist scores up to 250 by the share who got it. Wrong guesses stay on the guesser's phone, never the TV. Everyone draws once a round (twice with two players); best total scores 1,000, everyone else their share. |
| **Note Rush** | 1–8 | A side-by-side boards game: notes scroll down four lanes (on your phone and the TV) to an original little tune the TV plays, made from the chart itself (each lane a pair of notes in a pentatonic scale, with a soft beat). Tap a lane as its note hits the line: within 50ms is perfect (100), 100ms good (60), 150ms just in (30); a combo of 10 or more adds a bonus, a stray tap costs 10. Same chart for everyone (from the seed), busier and quicker each round; taps carry the server time they were made and the server judges them. Most points scores 1,000, everyone else their share. |
| **Copy Cat** | 2–8 | Turns go round: the leader records a 4-second move by tilting and swinging their phone (or dragging on the pad without motion sensors). Everyone watches it replayed on the TV, then records their copy. Copies are compared with dynamic time warping (so a little quicker or slower still matches): copiers score their match, 0 to 100; the leader scores up to 200, most when about half copy it well. Everyone leads once a round; best total scores 1,000, everyone else their share. |
| **Glide Drop** | 1–8 | A side-by-side boards game, seen from the side: your glider launches off a cliff. Turn your phone to tip the nose up (slower, flatter) or down (faster, steeper); FOLD folds the wings to drop (and opens them again). Land on the floating target: 100 in the middle, 50, 25 and 10 further out, nothing in the sea. Three flights each, to targets the same for everyone; best total scores 1,000, everyone else their share. |
| **Marble Rally** | 1–8 | A side-by-side boards game: tip your phone (or drag) to roll a marble along a narrow track floating in the sky; slope tiles push it downhill, and rolling off the edge drops you back at the last checkpoint. Three hand-made courses, one a round. Scored as a race. |
| **Maze Muncher** | 1–8 | A side-by-side boards game: two minutes in the same (original) maze. Swipe to steer (turns wait for the next opening; arrow keys work too); eat the dots (10), power pellets (50) and the fruit that turns up (300). Four ghosts come out one by one, each chasing its own way (straight for you, ahead of you, at you unless close, behind you), with spells of scattering to the corners; a power pellet scares them for 7 seconds so you can eat them (200, 400, 800…). Every power pellet you eat sends an extra ghost into a rival's maze (up to three each). Clearing the dots adds 500 and a fresh, quicker maze. Three lives. Most points scores 1,000, everyone else their share. |
| **Walker Rescue** | 1–8 | A side-by-side boards game: twelve little walkers march out of a door and keep walking, whatever is ahead. Pick a skill on your phone (block, dig, build steps, float) and tap a walker to give it to them, with a few of each per level. Three levels; most walkers saved wins, and quicker breaks ties. |
| **Castle Siege** | 2–4 | Every castle starts walled in. Fire (18 seconds): tap a rival's land to shell their wall. Repair (22 seconds): your own land fills the phone; drag the next piece into place and let go, and Turn turns it. A castle that isn't walled in all round when repairs end is out. Four sieges a round; survivors score 1,000, the fallen by how long they lasted. |
| **Clue Crew** | 2–8 | A co-op word-clue game in the style of two-player clue games, for the whole room. Everyone sees the same 25 words, but each phone shows a secret key: your green targets and red traps. Players take turns giving a one-word clue and a number; everyone else votes on the words they think it means (the most votes wins, ties at random). A target is found and the team can keep going, up to the number plus one; a word that isn't the clue-giver's ends the turn, and one of their traps ends the game. Find every target before everyone has had their turns (one turn each per round). Clues can't be, contain, or sit inside a board word. Everyone shares up to 700 a round for the words found (split among them), the clue-giver gets 50 more per word, and finding them all adds 300 a round. |
| **Concentration** | 1–8 | A race to find pairs. Everyone gets the same face-down board of playing cards on their phone (4 by 4 by default; change `GRID_SIZE` in `shared/games/concentration.ts`, 2 to 10, and an odd size leaves the centre empty). Tap two cards: a pair stays face up, anything else turns back over. Like Word Rush, clearing the board scores 300, plus up to 700 for the time left, less 1.5 seconds of it per guess (a pair of flips); running out of time scores a little for each pair found. The TV shows each player's matched squares and guesses, never the cards. One board per puzzle. |
| **Twenty-One** | 1–8 | Blackjack with no 10s or face cards: Ace to 9 only, from a fresh shoe of one deck per player each hand. Everyone is dealt one card face down (only your phone shows yours) and one face up, as in blackjack. Then, in turn order, each player draws a card face up for everyone to see, or holds; it keeps going round until everyone has held or bust, and once you hold you're done for the hand. Aces count 1 or 11. You have 20 seconds a turn, or you hold. Going over 21 is bust, and your face-down card is turned over straight away. At the end everyone's cards are shown: the closest to 21 wins 1,000 (ties all win), other hands at 21 or under score 20 a point (18 scores 360), and busts score nothing. The first turn moves one seat round each hand. One hand per puzzle. |
| **Blockbusters** | 2–8 | Two teams race across a board of hexagons, as on the game show (no Gold Rush), framed like the show: red bands top and bottom, white down the sides. Red links the top and bottom edges, White the left and right. With an even number of players the teams are equal and the board is 4 by 4; with an odd number Red is the smaller team and the board is the show's 5 wide by 4 high, so Red needs 4 hexagons and White 5. Each hexagon shows an answer's initials ("AE" for Albert Einstein, "NYC" for New York City). The team in control picks one on their phones. The question is read out a letter at a time, at reading pace. Anyone can buzz at any point, which stops the reading there; the buzzer types the whole answer (case, accents, small typos and a leading "The" are all fine). Right takes the hexagon and the next pick; wrong locks that team out, and the rest of the question is read out for the other team to buzz; if nobody gets it, another question on the same hexagon if there is one. 100 points per right answer and 500 to everyone on a team that wins a board. Questions are in `server/games/blockbusters/` (one file per topic; Q: and A: lines, with other accepted answers after `|`), and the initials come from the answer: one letter per capitalised word, skipping a leading "The" and small words like "of", every letter of an acronym (DNA, H2O as HO), and hyphenated words split (X-Ray as XR). One board per puzzle. |
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
  flags.ts         Questions the VIP flagged for review (flagged-questions.jsonl)
  games/           One file per mini game, plus the registry (games/index.ts)
shared/            Types shared by server and clients
  protocol.ts      Socket events, room/player types
  games/           Per-game view and input types
client/
  host/            Phaser host screen: one scene per mini game
  play/            Phone controller (plain DOM): one controller per mini game
android/           The Android app: the phone controller, built with `npm run app:build`
capacitor.config.ts  The Android app's settings
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
