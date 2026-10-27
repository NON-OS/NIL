// Who may rename a channel, change its settings and take people out: its creator or a workspace
// admin. Everyone in a group message manages it together; nobody manages a direct message.
export default function canManage(channel, user) {
  if (channel.kind === 'group') return true;
  if (channel.kind === 'dm') return false;
  return channel.created_by === user.id || Boolean(user.isAdmin);
}
