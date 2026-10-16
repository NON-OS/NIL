import ethCall from './ethCall.js';
import abiWord from './abiWord.js';
import selector from './selector.js';

const DECIMALS = selector('decimals()');

// An ERC-20's decimals() as its contract reports them, or null.
export default async function tokenDecimals(token) {
  const places = abiWord(await ethCall(token, `0x${DECIMALS}`), 0);
  return places !== null && places <= 77n ? Number(places) : null;
}
