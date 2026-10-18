// The meta-address a private payout to someone is worked out from: the one they published in
// Nil, or the one their wallet has in the ERC-6538 registry. `problem` says why there is none.
export default interface PayeeStealth {
  metaAddress: string | null;
  source: 'nil' | 'registry' | null;
  problem: 'no-wallet' | 'off' | 'none' | 'invalid' | 'unreadable' | null;
}
