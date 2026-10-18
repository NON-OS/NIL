// What the verifier answers with proof: every read Nil acts on. Helios checks each one against
// the chain head the beacon chain's sync committee signed: state reads (eth_call, balances,
// nonces, code) by Merkle proofs from the execution node, receipts and logs against the block's
// receipts root, and blocks by their hash. Anything not listed here and not relayed is refused.
const provenMethods = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getTransactionReceipt',
  'eth_getBlockReceipts',
  'eth_getLogs',
  'eth_call',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getCode',
]);

export default provenMethods;
