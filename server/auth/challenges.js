import challengeTable from './challengeTable.js';

// Challenges for wallet signatures, signed votes and bounty applications. Five minutes is
// plenty to read a message and sign it; twenty open at once covers a few tabs and retries.
const challenges = challengeTable({ ttlMs: 5 * 60_000, max: 5000, perClient: 20 });

export default challenges;
