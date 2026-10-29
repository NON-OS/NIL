import { useState } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import PeoplePicker from './PeoplePicker';
import DisappearSelect from './DisappearSelect';
import toast from '../../state/toast';
import chatChannels from '../../actions/chat/chatChannels';
import chatMeta from '../../actions/chat/chatMeta';

type Kind = 'channel' | 'dm' | 'group';
const KINDS: [Kind, string][] = [
  ['channel', 'Channel'],
  ['dm', 'Direct message'],
  ['group', 'Group'],
];

// Starting a conversation: a channel for the whole team or for some people, a direct message, or
// a group message. Its name and topic are encrypted like everything said in it.
export default function NewConversation({ initial, onClose, onMade }: { initial: Kind; onClose: () => void; onMade: (id: string) => void }) {
  const [kind, setKind] = useState<Kind>(initial);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [team, setTeam] = useState(true);
  const [people, setPeople] = useState<string[]>([]);
  const [disappear, setDisappear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = kind === 'channel' ? Boolean(name.trim()) && (team || people.length > 0) : kind === 'dm' ? people.length === 1 : people.length >= 2;

  const make = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const channel = await chatChannels.create({ kind, audience: kind === 'channel' && team ? 'team' : 'people', people, meta: kind === 'dm' ? undefined : { name, topic }, disappearSeconds: disappear });
      onClose();
      onMade(channel.id);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New conversation"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => make()} disabled={!ready || busy}>
            {busy && <Spinner size={14} />} {kind === 'channel' ? 'Create channel' : 'Start'}
          </button>
        </>
      }
    >
      <form className="modal-body" style={{ display: 'grid', gap: 14 }} onSubmit={make}>
        <div className="chat-kinds" role="group" aria-label="Kind of conversation">
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={k === kind ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
              aria-pressed={k === kind}
              onClick={() => {
                setKind(k);
                setPeople(k === 'dm' ? people.slice(0, 1) : people);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {kind !== 'dm' && (
          <label className="field">
            <span>{kind === 'channel' ? 'Name' : 'Name (optional)'}</span>
            <input className="input" autoFocus value={name} maxLength={chatMeta.limits.name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'channel' ? 'e.g. launch' : 'e.g. Weekend on-call'} />
          </label>
        )}
        {kind === 'channel' && (
          <>
            <label className="field">
              <span>Topic (optional)</span>
              <input className="input" value={topic} maxLength={chatMeta.limits.topic} onChange={(e) => setTopic(e.target.value)} placeholder="What it’s for" />
            </label>
            <div className="field" role="radiogroup" aria-label="Who is in it">
              <span>Who is in it</span>
              <label className="chat-person">
                <input type="radio" name="chat-audience" checked={team} onChange={() => setTeam(true)} /> The whole team, and everyone who joins it
              </label>
              <label className="chat-person">
                <input type="radio" name="chat-audience" checked={!team} onChange={() => setTeam(false)} /> Only the people I pick
              </label>
            </div>
          </>
        )}
        {(kind !== 'channel' || !team) && <PeoplePicker chosen={people} onChange={setPeople} single={kind === 'dm'} label={kind === 'dm' ? 'Who to write to' : 'People'} />}
        <DisappearSelect value={disappear} onChange={setDisappear} />
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          The key is sealed only to people whose keys you’ve confirmed. Anyone else gets it once you, or a teammate, have checked theirs.
        </p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
