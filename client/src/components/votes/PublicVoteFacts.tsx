import type PublicVote from '../../types/PublicVote';

// Where the voting power came from, so anyone can read it again from the chain: the block it was
// read at and the contracts asked. The audit file holds the same, with every ballot's signature.
export default function PublicVoteFacts({ vote }: { vote: PublicVote }) {
  const { snapshot } = vote;
  const facts: [string, string][] = [
    ['Snapshot block', String(snapshot.block)],
    ['Chain ID', String(snapshot.chainId)],
    [`${snapshot.token.symbol} token`, snapshot.token.address ?? 'not set'],
    ['Staking contract', snapshot.staking ?? 'not set'],
    ['Zero-State Pass', snapshot.zsp ?? 'not set'],
    ['Power per pass', snapshot.zspPower ? `${snapshot.zspPower} ${snapshot.token.symbol}` : 'none'],
  ];
  return (
    <section className="public-vote-facts" aria-labelledby="public-vote-facts-title">
      <h2 id="public-vote-facts-title">How the power was counted</h2>
      <p className="muted">
        Each wallet’s power is the {snapshot.token.symbol} it held, plus {snapshot.token.symbol} staked, plus its Zero-State Passes times the power per pass, all read at one block when the vote opened. A member’s wallets count together as one ballot, as in their workspace.
      </p>
      <dl>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="mono">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
