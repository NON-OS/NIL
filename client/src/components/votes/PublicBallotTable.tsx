import dates from '../../lib/dates';
import type PublicVote from '../../types/PublicVote';

// Every ballot of a public vote, newest first: the wallet that signed it, its choice and its power.
// Wallets are shown whole, since checking them against the chain is the point.
export default function PublicBallotTable({ vote, power }: { vote: PublicVote; power: (w: string) => string }) {
  if (!vote.ballots?.length) return <p className="muted">No ballots yet.</p>;
  const newest = [...vote.ballots].reverse();
  return (
    <section className="ballot-list public-ballots" aria-labelledby="public-ballots-title">
      <h2 id="public-ballots-title">Every ballot</h2>
      <div className="public-ballots-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Wallet</th>
              <th scope="col">Choice</th>
              <th scope="col">Power</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {newest.map((b) => (
              <tr key={b.address}>
                <td className="mono">{b.address}</td>
                <td>{vote.options[b.choice]}</td>
                <td className="num">{power(b.weight)}</td>
                <td className="muted">
                  <time dateTime={new Date(b.castAt).toISOString()}>{dates.ago(b.castAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
