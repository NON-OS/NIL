import store from '../state/store';
import formatUnits from './formatUnits';

// "250 NOX", "100 USDC": an amount in a reward token's smallest unit, for people to read.
// Unknown symbols fall back to 18 decimals, the ERC-20 default.
export default function tokenAmount(value: string | bigint, symbol: string | null | undefined, digits = 4) {
  const { rewards, nox } = store.get();
  const name = symbol || nox?.symbol || 'NOX';
  const token = rewards.find((t) => t.symbol === name);
  return `${formatUnits(value, token?.decimals ?? 18, digits)} ${name}`;
}
