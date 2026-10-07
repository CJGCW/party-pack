import allWords from 'an-array-of-english-words';
import { WORD_LENGTH } from '../../shared/games/wordleRace';

/** Everything that counts as a real word when guessing. */
const VALID_GUESSES = new Set(
  allWords.filter((w) => w.length === WORD_LENGTH && /^[a-z]+$/.test(w)).map((w) => w.toUpperCase()),
);

/** Common, recognisable words used as secret answers. */
const ANSWER_CANDIDATES = `
about above actor acute adopt adult after again agent agree ahead alarm album alert alike alive allow alone
along alter angel anger angle angry apart apple apply arena argue arise armor array aside asset audio avoid
award aware awful bacon badge baker basic basin beach beard beast begin being below bench berry birth black
blade blame blank blast blaze bleed blend bless blind block blood bloom board boast bonus boost booth bound
brain brand brave bread break brick bride brief bring broad brook brown brush build bunch burst cabin cable
camel candy cargo carry catch cause chain chair chalk charm chart chase cheap check cheek cheer chess chest
chief child chill choir civic claim class clean clear clerk click cliff climb clock close cloud clown coach
coast color comet coral couch count court cover crack craft crane crash crawl crazy cream crime crisp cross
crowd crown crumb crush curve cycle daily dance death delay depth diary dirty disco ditch dizzy dough draft
drain drama dream dress drift drink drive eager eagle early earth eight elbow elder empty enemy enjoy enter
entry equal error essay event every exact exist extra fable faint fairy faith false fancy feast fence ferry
fever field fifth fight final flame flash fleet flock flood floor flour fluid flute focus force forge forth
frame fresh front frost fruit funny gauge ghost giant given glass globe glory glove goose grace grade grain
grand grape graph grass great green greet grill grind group guard guess guest guide habit happy harsh heart
heavy hedge hello honey horse hotel house human humor hurry ideal image index inner input irony issue ivory
jelly jewel joint judge juice knife knock label laser laugh layer learn lemon level light limit linen liver
lobby local lodge logic loose lucky lunch magic major maple march match mayor medal melon mercy metal minor
model money month moral motor mount mouse mouth movie music nerve never night noble noise north novel nurse
ocean offer olive onion opera orbit order organ other otter outer owner paint panel panic paper party pasta
patch peace peach pearl pedal penny phone photo piano piece pilot pitch pizza place plain plane plant plate
plaza point polar porch pound power press price pride prime print prize proof proud pulse punch puppy queen
quest quick quiet quilt quite radio raise ranch range rapid raven reach react ready realm relax reply rider
ridge rifle right rival river roast robot rocky round route royal rugby ruler rural salad sauce scale scarf
scene scent scoop scout screw seven shade shake shape share shark sharp sheep sheet shelf shell shift shine
shirt shock shore short shout sight skill skirt skull sleep slice slide smart smile smoke snack snake solar
solid sound south space spare spark speak speed spell spend spice spine spoon sport spray squad stack staff
stage stair stamp stand start state steam steel stick still stone storm story stove straw strip study style
sugar suite sunny super sweet swing sword table taste teach tears thank theme thick thief thing think third
thumb tiger toast today token tooth topic torch total touch tower track trade trail train treat trend trial
tribe trick truck trust truth tulip twist uncle under union unity upper urban usual valid value video virus
visit vital vocal voice waste watch water whale wheat wheel while white whole woman world worry worth would
wrist write wrong yacht young youth zebra
`
  .split(/\s+/)
  .map((w) => w.toUpperCase())
  .filter((w) => w.length === WORD_LENGTH && VALID_GUESSES.has(w));

export function isValidGuess(word: string): boolean {
  return VALID_GUESSES.has(word);
}

/** Picks `count` distinct random answers. */
export function pickAnswers(count: number): string[] {
  const pool = [...ANSWER_CANDIDATES];
  const picked: string[] = [];
  while (picked.length < count && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}
