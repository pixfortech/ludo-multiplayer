// Main-thread time spent animating characters (their mixers posing the skeletons), for the board's frame
// statistics. A module of its own so the board can read it without loading the character code, which is
// its own chunk (only cities with characters fetch it).
export const characterWork = { ms: 0 };
