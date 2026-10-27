import useStore from '../../state/useStore';
import type SharedFolder from '../../types/SharedFolder';

// What a reader should know before relying on a folder: a name no teammate's signature checks
// out on, an older version than one seen here, or a name signed with someone's earlier key.
export default function FolderNotices({ folder, missing }: { folder: SharedFolder; missing: boolean }) {
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
          <span>Nil can’t confirm a teammate named this folder: no signature on it checks out against the keys you know. Files that do check out still open, but nothing is added or shared under its key. Its creator or an admin can give it a new key under Who can open this. If someone’s key changed recently, check it first.</span>
        </div>
      )}
      {folder.warning === 'rollback' && (
        <div className="files-notice" role="alert">
          <span>This is an older version of the folder than one you’ve already opened here. The server may be holding back newer changes.</span>
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
