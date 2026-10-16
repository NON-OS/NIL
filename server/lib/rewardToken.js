import config from '../config.js';
import HttpError from './HttpError.js';

// The configured reward token for a symbol. Missing symbols mean NOX, as older bounties do.
export default function rewardToken(symbol) {
  const token = config.rewards.find((t) => t.symbol === (symbol || config.nox.symbol));
  if (!token) throw HttpError.badRequest(`${symbol} isn’t one of the tokens this server pays bounties in.`);
  return token;
}
