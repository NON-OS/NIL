import useStore from '../../state/useStore';
import type DocItem from '../../types/DocItem';
import type LiveStatus from '../../types/LiveStatus';

interface Props {
  doc: DocItem;
  status: LiveStatus;
  canManage: boolean;
  error: string | null;
}

// What the editor has to tell about the version in front of you: whether its author checks out,
// whether the server is holding back something newer, and changes that failed their check.
export default function DocBanners({ doc, status, canManage, error }: Props) {
  const users = useStore((s) => s.users);
  return (
    <>
      {error && (
        <div className="doc-conflict" role="alert">
          <span>{error}</span>
        </div>
      )}
      {(doc.warning === 'unverified' || status.state === 'readonly') && (
        <div className="doc-conflict" role="alert">
          <span>Nil can’t confirm a teammate wrote the newest version of this doc: no signature on it checks out against the keys you know. The server may have changed it, so don’t rely on it. {canManage ? 'To keep it, open Share and save: the doc gets a new key and your signature.' : 'Its creator or an admin can re-key it.'} If someone’s key changed recently, check it first.</span>
        </div>
      )}
      {doc.warning === 'rollback' && (
        <div className="doc-conflict" role="alert">
          <span>This is an older version than one you’ve already opened here. The server may be holding back newer changes.</span>
        </div>
      )}
      {status.refused > 0 && (
        <div className="doc-conflict" role="alert">
          <span>
            {status.refused === 1 ? 'One change' : `${status.refused} changes`} to this doc failed their check and {status.refused === 1 ? 'was' : 'were'} left out. A change has to open with the doc’s key and carry a signature from a teammate whose key you know. If someone’s key changed recently, check it in Settings.
          </span>
        </div>
      )}
      {doc.oldKey && (
        <div className="doc-conflict">
          <span>
            {users[doc.updatedBy ?? '']?.name ?? 'A former member'} signed this version with an earlier key, <span className="mono">{doc.oldKey}</span>, from before their key changed.
          </span>
        </div>
      )}
    </>
  );
}
