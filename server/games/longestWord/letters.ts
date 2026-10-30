// The letter piles each round's picks come from, as on the show: both piles are shuffled at the
// start of a round, and each pick takes the top letter of the vowel or consonant pile, so a
// letter can't come up more times in a round than the pile holds. 67 vowels and 74 consonants.

export const VOWEL_PILE: Record<string, number> = { A: 15, E: 21, I: 13, O: 13, U: 5 };

export const CONSONANT_PILE: Record<string, number> = {
  B: 2, C: 3, D: 6, F: 2, G: 3, H: 2, J: 1, K: 1, L: 5, M: 4, N: 8,
  P: 4, Q: 1, R: 9, S: 9, T: 9, V: 1, W: 1, X: 1, Y: 1, Z: 1,
};

/** A shuffled pile to draw from, top letter last. */
export function shuffledPile(counts: Record<string, number>): string[] {
  const pile = Object.entries(counts).flatMap(([letter, n]) => Array<string>(n).fill(letter));
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  return pile;
}
