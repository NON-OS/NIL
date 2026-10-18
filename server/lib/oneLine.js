// Control characters, line and paragraph separators and the bidirectional overrides: anything
// that could start a new line inside a value, or make it read differently from what it holds.
const BREAKS = /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const RUNS = /[\p{Cc}\s\u2028\u2029\u202a-\u202e\u2066-\u2069]+/gu;

const oneLine = {
  has: (text) => BREAKS.test(text),
  // every run of them, and of whitespace, as one space
  flatten: (text) => String(text).replace(RUNS, ' ').trim(),
};

export default oneLine;
