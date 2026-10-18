import signedChallenges from './signedChallenges.js';

// Challenges for wallet sign-in and public bounty applications, which anyone can ask for without
// signing in. Five minutes is plenty to read a message and sign it.
const walletChallenges = signedChallenges({ ttlMs: 5 * 60_000 });

export default walletChallenges;
