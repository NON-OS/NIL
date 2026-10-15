import holdings from './holdings.js';

// One person, one vote, or one NOX, one vote.
export default async function voteWeight(userId, weighting) {
  return weighting === 'nox' ? (await holdings(userId)).toString() : '1';
}
