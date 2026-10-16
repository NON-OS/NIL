import envNumber from '../lib/envNumber.js';

// NOX lives on Ethereum. NOX_RPC_URL=off disables every on-chain feature.
export default Object.freeze({
  off: process.env.NOX_RPC_URL === 'off',
  id: envNumber('NOX_CHAIN_ID', 1, { min: 1 }),
});
