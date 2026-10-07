// wordnet-db ships without types: it exposes the folder holding the WordNet dict files.
declare module 'wordnet-db' {
  const wordnet: { path: string; version: string; files: string[] };
  export default wordnet;
}
