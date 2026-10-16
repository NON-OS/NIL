import ethCall from './ethCall.js';
import abiWord from './abiWord.js';
import selector from './selector.js';

const LATEST_ROUND = selector('latestRoundData()');
const DECIMALS = selector('decimals()');

// A Chainlink price feed's latest answer: (roundId, answer, startedAt, updatedAt,
// answeredInRound). Null when the feed doesn't answer, answers zero or less, or hasn't been
// updated within `maxAgeMs`, because a stale price is worse than none.
export default async function feedPrice(feed, maxAgeMs, now = Date.now()) {
  const [round, decimals] = await Promise.all([ethCall(feed, `0x${LATEST_ROUND}`), ethCall(feed, `0x${DECIMALS}`)]);
  const answer = abiWord(round, 1, { signed: true });
  const updatedAt = abiWord(round, 3);
  const places = abiWord(decimals, 0);
  if (answer === null || updatedAt === null || places === null || answer <= 0n || places > 36n) return null;
  if (now - Number(updatedAt) * 1000 > maxAgeMs) return null;
  return { answer, decimals: Number(places) };
}
