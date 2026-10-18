import './Keys.css';
import type { ReactNode } from 'react';
import Avatar from '../ui/Avatar';
import cx from '../../lib/cx';
import dates from '../../lib/dates';
import shortAddress from '../../lib/shortAddress';
import type MemberKey from '../../types/MemberKey';
import type User from '../../types/User';

const LABEL = { confirmed: 'Confirmed', new: 'New key', changed: 'Key changed' };

// One person's key: its fingerprint to compare out loud, the pinned one it replaces if it
// changed, and the wallet that signed it. A key for someone deactivated, or for someone the
// workspace doesn't list at all, says so, since nobody should be publishing one.
export default function KeyRow({ entry, user, action }: { entry: MemberKey; user: User | undefined; action?: ReactNode }) {
  return (
    <div className="key-row">
      <Avatar user={user} size={26} />
      <div style={{ minWidth: 0 }}>
        <div className="key-row-head">
          {user?.name ?? 'Not in this workspace'}
          {user?.deactivated && <span className="key-state">Deactivated</span>}
          <span className={cx('key-state', entry.state)}>{LABEL[entry.state]}</span>
        </div>
        <div className="key-fingerprint" aria-label="Fingerprint">
          {entry.fingerprint}
        </div>
        {entry.previousFingerprint && <div className="key-fingerprint was" aria-label="Previous fingerprint">{entry.previousFingerprint}</div>}
        <div className="key-sub">
          Signed by wallet <span className="mono" title={entry.address}>{shortAddress(entry.address)}</span> · {dates.ago(entry.createdAt)}
        </div>
      </div>
      {action}
    </div>
  );
}
