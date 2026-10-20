// Short brand words that are refused as a whole part of a name, between dashes or alone, after
// the same letter swaps as the blocked words: "nil-team" and "my-n0x" are out, while "vanilla"
// and "equinox" stay fine, which refusing them anywhere would not allow. The operator adds more
// with CLOUD_BLOCKED_PARTS.
const blockedParts = Object.freeze(['nil', 'nox']);

export default blockedParts;
