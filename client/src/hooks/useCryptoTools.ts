import useStore from '../state/useStore';

// Whether this workspace shows its crypto tools: bounties, votes, proof of work, private
// payouts and the token holder door. Everyday teams start with them off.
export default function useCryptoTools() {
  return useStore((s) => s.workspace.cryptoTools);
}
