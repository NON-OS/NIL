import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import ConfirmButton from '../ui/ConfirmButton';
import PeoplePicker from './PeoplePicker';
import DisappearSelect from './DisappearSelect';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import isAdmin from '../../lib/isAdmin';
import dates from '../../lib/dates';
import chatChannels from '../../actions/chat/chatChannels';
import chatMeta from '../../actions/chat/chatMeta';
import chatRosters from '../../actions/chat/chatRosters';
import confirmKeys from '../../actions/confirmKeys';
import type ChatChannel from '../../types/ChatChannel';
import type ChatRoster from '../../types/ChatRoster';

const NOTIFY: [ChatChannel['notify'], string][] = [
  ['default', 'Default'],
  ['all', 'Every message'],
  ['mentions', 'Only mentions'],
  ['none', 'Nothing'],
];

// A conversation's name, people, disappearing messages, notifications and keys. Who may change
// what follows who manages it: a channel's creator or an admin, everyone in a group, and in a
// direct message both people may set how long messages stay.
export default function ChannelSettings({ channel, onClose, onGone }: { channel: ChatChannel; onClose: () => void; onGone: () => void }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic);
  const [adding, setAdding] = useState<string[]>([]);
  const [head, setHead] = useState<ChatRoster | null>(null);
  const manages = channel.kind === 'group' || (channel.kind === 'channel' && (channel.createdBy === me?.id || isAdmin(me)));
  const every = channel.rotateAt && channel.epochAt ? Math.round((channel.rotateAt - channel.epochAt) / 86_400_000) : null;
  const peopleChange = manages && channel.audience === 'people' && channel.kind !== 'dm';

  useEffect(() => {
    chatRosters.load(channel).then((c) => setHead(c.rosters[c.rosters.length - 1] ?? null), () => {});
  }, [channel.id, channel.epoch]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast.show(done);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Modal title="Conversation settings" onClose={onClose} width={600}>
      <div className="modal-body" style={{ display: 'grid', gap: 18 }}>
        {channel.kind !== 'dm' && manages && (
          <form
            style={{ display: 'grid', gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => chatChannels.rename(channel, { name, topic }), 'Saved, encrypted.');
            }}
          >
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} maxLength={chatMeta.limits.name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Topic</span>
              <input className="input" value={topic} maxLength={chatMeta.limits.topic} onChange={(e) => setTopic(e.target.value)} />
            </label>
            <div>
              <button type="submit" className="btn btn-sm" disabled={(channel.kind === 'channel' && !name.trim()) || (name === channel.name && topic === channel.topic)}>
                Save name and topic
              </button>
            </div>
          </form>
        )}

        <div className="field">
          <span>{channel.audience === 'team' ? 'Everyone on the team' : 'People'}</span>
          <div className="chat-people">
            {channel.members.map((id) => (
              <div key={id} className="chat-person">
                <Avatar user={users[id]} size={24} />
                <span className="grow">{users[id]?.name ?? 'Someone'}</span>
                <small>{channel.keyHolders.includes(id) ? 'Holds the key' : 'Waiting for a key'}</small>
                {peopleChange && id !== me?.id && (
                  <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Remove?" label={`Remove ${users[id]?.name ?? 'them'}`} onConfirm={() => void run(() => chatChannels.setMembers(channel, channel.members.filter((m) => m !== id)), 'Removed. The conversation has a new key.')}>
                    Remove
                  </ConfirmButton>
                )}
              </div>
            ))}
          </div>
        </div>

        {peopleChange && (
          <div style={{ display: 'grid', gap: 8 }}>
            <PeoplePicker chosen={adding} onChange={(ids) => setAdding(ids.filter((id) => !channel.members.includes(id)))} label="Add people" />
            <div>
              <button type="button" className="btn btn-sm" disabled={!adding.length} onClick={() => void run(() => chatChannels.setMembers(channel, [...channel.members, ...adding]).then(() => setAdding([])), 'Added. They can read back through what you hold.')}>
                Add {adding.length || ''}
              </button>
            </div>
          </div>
        )}

        <DisappearSelect value={channel.disappearSeconds} disabled={!manages && channel.kind !== 'dm'} onChange={(s) => void run(() => chatChannels.disappear(channel, s))} />

        <label className="field">
          <span>Notify me about</span>
          <select className="input" value={channel.notify} onChange={(e) => void run(() => chatChannels.notify(channel, e.target.value as ChatChannel['notify']))}>
            {NOTIFY.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small>By default, direct and group messages notify you, and channels only when you’re mentioned. Notifications on your devices never include the words or the conversation’s name.</small>
        </label>

        <div className="field">
          <span>Encryption</span>
          <small>
            <KeyRound size={12} /> Key {channel.epoch}
            {head ? `, started ${dates.ago(head.at)} by ${users[head.by]?.name ?? 'someone'}, sealed to ${head.members.length} ${head.members.length === 1 ? 'person' : 'people'}.` : '.'}{' '}
            A new key starts when someone leaves{every ? `, and at least every ${every === 1 ? 'day' : `${every} days`}` : ''}.
          </small>
          <div>
            <button type="button" className="btn btn-sm" onClick={() => confirmKeys.show(channel.members.filter((id) => id !== me?.id), 'this conversation')}>
              Compare keys
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {channel.audience === 'people' && channel.kind !== 'dm' && (
            <ConfirmButton className="btn btn-sm" confirmLabel="Leave for good?" onConfirm={() => void run(() => chatChannels.leave(channel)).then(onGone)}>
              Leave
            </ConfirmButton>
          )}
          {channel.kind === 'channel' && manages && (
            <ConfirmButton className="btn btn-sm btn-danger" confirmLabel="Delete it and every message?" onConfirm={() => void run(() => chatChannels.remove(channel)).then(onGone)}>
              Delete channel
            </ConfirmButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
