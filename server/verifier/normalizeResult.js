const QUANTITY = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount']);

// Helios hands some numbers back as decimal strings or plain numbers (a balance, a nonce) where
// JSON-RPC has 0x-prefixed hex. Everything else it returns is already in JSON-RPC form.
function quantity(value) {
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return value.toLowerCase();
  if (typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && /^\d+$/.test(value))) {
    return `0x${BigInt(value).toString(16)}`;
  }
  return undefined;
}

// The proven answer as an Ethereum node would have written it, or undefined when Helios gave
// back nothing usable.
export default function normalizeResult(method, value) {
  if (QUANTITY.has(method)) return quantity(value);
  return value ?? undefined;
}
