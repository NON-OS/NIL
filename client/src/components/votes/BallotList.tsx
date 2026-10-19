import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type Proposal from '../../types/Proposal';

// Who voted what, for a vote whose ballots are public: every member sees each wallet's choice,
// the way a DAO's votes are open. Folded away by default so a long list doesn't push the next
// vote off the page; a sealed vote has no list until it closes.
export default function BallotList({ proposal, weight }: { proposal: Proposal; weight: (w: string) => string }) {
  const users = useStore((s) => s.users);
  if (!proposal.ballots) {
    return proposal.sealed && !proposal.closedAt ? <p className="muted ballot-wait">Who voted what shows here once the vote closes.</p> : null;
  }
  if (!proposal.ballots.length) return null;
  const newest = [...proposal.ballots].reverse();

  return (
    <details className="ballot-list">
      <summary>
        Who voted <span className="muted num">{newest.length}</span>
      </summary>
      <table>
        <caption className="sr-only">Every ballot in this vote, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Member</th>
            <th scope="col">Choice</th>
            {proposal.weighting === 'power' && <th scope="col">Power</th>}
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {newest.map((b) => {
            const user = users[b.userId];
            return (
              <tr key={b.userId}>
                <td>
                  <span className="ballot-who">
                    <Avatar user={user} size={20} title={user?.name ?? 'Former member'} />
                    <span>
                      {user?.name ?? 'Former member'}
                      <span className="muted mono" title={b.address}>
                        {shortAddress(b.address)}
                      </span>
                    </span>
                  </span>
                </td>
                <td>{proposal.options[b.choice]}</td>
                {proposal.weighting === 'power' && <td className="num">{weight(b.weight)}</td>}
                <td className="muted">
                  <time dateTime={new Date(b.castAt).toISOString()}>{dates.ago(b.castAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
