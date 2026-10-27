import keyring from '../../state/keyring';
import chatRosters from './chatRosters';
import chatMeta from './chatMeta';
import type ChatChannel from '../../types/ChatChannel';
import type ChatChannelRow from '../../types/ChatChannelRow';

// A conversation with its name and topic opened, once its member lists check out.
export default async function openChannel(row: ChatChannelRow): Promise<ChatChannel> {
  // locked, the list is only for its counts: nothing to open, so nothing to check yet
  if (!keyring.identity()) return { ...row, name: '', topic: '', metaState: row.metaCt ? 'locked' : 'none' };
  try {
    const chain = await chatRosters.load(row);
    return { ...row, ...(await chatMeta.open(row, chain)) };
  } catch {
    return { ...row, name: '', topic: '', metaState: row.metaCt ? 'locked' : 'none' };
  }
}
