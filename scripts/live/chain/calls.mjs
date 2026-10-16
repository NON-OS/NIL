import selector from '../../../server/chain/selector.js';

const word = (value) => (typeof value === 'string' ? value.replace(/^0x/, '').toLowerCase() : BigInt(value).toString(16)).padStart(64, '0');

// Call data for the few contract functions the live checks use, built by hand so the checks
// need nothing beyond what the app already depends on.
const calls = {
  selector,
  word,
  balanceOf: (owner) => `0x${selector('balanceOf(address)')}${word(owner)}`,
  transfer: (to, amount) => `0x${selector('transfer(address,uint256)')}${word(to)}${word(amount)}`,
  approve: (spender, amount) => `0x${selector('approve(address,uint256)')}${word(spender)}${word(amount)}`,
  transferFrom: (from, to, amountOrId) => `0x${selector('transferFrom(address,address,uint256)')}${word(from)}${word(to)}${word(amountOrId)}`,
  ownerOf: (id) => `0x${selector('ownerOf(uint256)')}${word(id)}`,
  stake: (amount) => `0x${selector('stake(uint256)')}${word(amount)}`,
  unstake: (amount) => `0x${selector('unstake(uint256)')}${word(amount)}`,
  getStakeInfo: (owner) => `0x${selector('getStakeInfo(address)')}${word(owner)}`,
  fees: () => `0x${selector('fees()')}`,
  // NOX's fee settings: buy, sell and wallet-to-wallet fees, then how a fee is shared out
  setFees: (values) => `0x${selector('setFees(uint16,uint16,uint16,uint16,uint16,uint16,uint16)')}${values.map(word).join('')}`,
};

export default calls;
