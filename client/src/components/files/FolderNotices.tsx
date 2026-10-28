import useStore from '../../state/useStore';
import type SharedFolder from '../../types/SharedFolder';

// What a reader should know before relying on a folder: a name its creator or an admin didn't
// sign, an older version than one seen here, a name signed with someone's earlier key, and files
// still being encrypted again after someone was taken out.
export default function FolderNotices({ folder, missing, waiting = 0, problem = '' }: { folder: SharedFolder; missing: boolean; waiting?: number; problem?: string }) {
  const users = useStore((s) => s.users);
  return (
    <>
      {missing && (
        <div className="files-notice" role="alert">
          <span>That folder is gone. Someone may have deleted or moved it.</span>
        </div>
      )}
      {folder.warning === 'unverified' && (
        <div className="files-notice" role="alert">
          <span>Nil can’t confirm the folder’s creator or an admin named this folder: no signature of theirs on it checks out against the keys you know. Files that do check out still open, but nothing is added or shared under its key. Its creator or an admin can give it a new key under Who can open this. If someone’s key changed recently, check it first.</span>
        </div>
      )}
      {folder.warning === 'rollback' && (
        <div className="files-notice" role="alert">
          <span>This is an older version of the folder than one you’ve already opened here. The server may be holding back newer changes.</span>
        </div>
      )}
      {waiting > 0 && (
        <div className="files-notice" role="status">
          <span>
            Someone was taken out of this folder, so its files are being encrypted again under fresh keys, in this browser and in others that have it open. {waiting} {waiting === 1 ? 'thing waits' : 'things wait'}. You can keep working meanwhile; moving or renaming something waiting has to wait until it’s done.
            {problem && ` It stopped here: ${problem}`}
          </span>
        </div>
      )}
      {folder.oldKey && (
        <div className="files-notice">
          <span>
            {users[folder.updatedBy ?? '']?.name ?? 'A former member'} signed this folder’s name with an earlier key, <span className="mono">{folder.oldKey}</span>, from before their key changed.
          </span>
        </div>
      )}
    </>
  );
}
