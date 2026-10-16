import './TeamKindChoice.css';

const KINDS = [
  {
    cryptoTools: false,
    title: 'Everyday team',
    detail: 'Tasks, projects, docs and private tasks. Crypto tools stay hidden; an admin can turn them on later in Settings.',
  },
  {
    cryptoTools: true,
    title: 'Crypto team',
    detail: 'Everything on, including bounties paid in tokens, wallet votes and proof of work.',
  },
];

// The one question setup asks about the team. It only decides which tools show at first.
export default function TeamKindChoice({ cryptoTools, onChange }: { cryptoTools: boolean; onChange: (cryptoTools: boolean) => void }) {
  return (
    <fieldset className="team-kind">
      <legend>What kind of team is this?</legend>
      {KINDS.map((kind) => (
        <label key={kind.title} className="team-kind-option">
          <input type="radio" name="team-kind" checked={cryptoTools === kind.cryptoTools} onChange={() => onChange(kind.cryptoTools)} />
          <span>
            <b>{kind.title}</b>
            <small>{kind.detail}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
