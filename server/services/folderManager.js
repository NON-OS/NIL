// Whoever made a shared folder, and admins, manage it: they decide who can open it, rename it, and
// may move, rename or delete anything in it. Everyone else changes only what they added.
export default function folderManager(folder, user) {
  return folder.created_by === user.id || Boolean(user.isAdmin);
}
