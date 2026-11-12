# Painted backdrops for the Wumble puzzles

The Wumble puzzles draw their backdrops in code (`shared/sceneArt.ts`). Painted pictures look much better. Drop one in and the game uses it in place of the code-drawn scene.

## What to make

Each scene needs two pictures:

| File | Size | Used on |
|---|---|---|
| `client/public/scenes/<scene>-portrait.jpg` | 1080 × 1920 (9:16) | phones |
| `client/public/scenes/<scene>-landscape.jpg` | 1920 × 1080 (16:9) | the TV |

`<scene>` is `glade`, `meadow` or `pond`. JPEG at about 85% quality keeps each one well under 1 MB. If a picture is missing, the game draws that scene in code instead.

Which puzzles use which scene:
- **glade:** Two Doors, Seating Chart, Lens Lab.
- **meadow:** Picky Eater, Line Up, Stepping Stones.
- **pond:** Lookalikes, Room Sort, Switchback.

## Things every picture needs

- Leave the **middle open**: an empty clearing, path or pond in the centre and lower half. The puzzle and the Wumbles sit there, so keep it uncluttered and fairly even in tone.
- Put the detail **around the edges**, framing the middle: trees, roots, rocks, leaves.
- Draw **no characters, creatures, text, logos or UI**.
- Keep the **lighting soft**, with a warm pool of light on the ground in the middle.
- Every scene must be **original**. Don't ask for it in the style of a named game, studio or artist.

## Style, for every prompt

> A hand-painted storybook background for a children's puzzle game: rich gouache and oil-paint brushwork with visible strokes, soft painterly edges, warm glowing light, deep atmospheric perspective with hazy distant hills, chunky whimsical shapes and slightly exaggerated proportions. An empty clearing in the centre foreground, lit by a soft pool of light, with detail framing the edges. No characters, no text.

Add the scene's own part after it.

## The scenes

**Dusk glade** (`glade`)
> Twilight in a cosy forest glade. A purple sky fades to warm orange at the horizon, with a pale moon and the first stars. Big gnarled trees with twisting roots stand at both sides, and a sandy path winds into the clearing. Red, gold and violet toadstools glow softly among mossy rocks. Fireflies float over the grass, and dark leafy branches hang in from the top corners.

**Morning meadow** (`meadow`)
> A bright spring morning in a rolling meadow. Blue sky, puffy white clouds and a golden sun, with sunbeams slanting across. Rounded green hills fade into soft haze. Leafy trees frame both sides, and a sandy path winds between drifts of pink, white, purple and orange wildflowers. There are smooth mossy stones, and tall grass frames the bottom corners.

**Night pond** (`pond`)
> A peaceful night by a woodland pond. A deep blue starry sky, with a bright moon reflected as rippling streaks on the water. Lily pads with pale pink flowers float on the dark, glassy pond in the centre, and cattails and reeds grow along its banks. Dark blue-green trees frame both sides, and faint mist hangs over the far hills.

## Landscape versions

Use the same prompt, but ask for a 16:9 picture. Spread the framing trees wider, and keep the open middle area larger, because the TV shows the puzzle and the players' cards there.
