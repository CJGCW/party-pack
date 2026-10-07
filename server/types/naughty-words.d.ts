// naughty-words ships without types: it exports one word list per language code.
declare module 'naughty-words' {
  const lists: Record<string, string[]>;
  export default lists;
}
