import challengeTable from './challengeTable.js';

// Challenges for signed votes, which only signed-in members can ask for. Five minutes is plenty
// to read a message and sign it; twenty open at once covers a few tabs and retries. Wallet
// sign-in and bounty applications, open to anyone, use walletChallenges instead.
const challenges = challengeTable({ ttlMs: 5 * 60_000, max: 5000, perClient: 20 });

export default challenges;
