import settingsStore from './settingsStore.js';
import check from '../lib/check.js';

const DEFAULTS = { invitePolicy: 'admins', shareLinks: false };

// Who may invite people, and whether read-only share links are allowed at all (off until an
// admin turns them on, since they make data reachable without signing in).
const sharingPolicy = {
  get: () => ({ ...DEFAULTS, ...settingsStore.get('sharing', {}) }),

  set(input) {
    const next = { ...sharingPolicy.get() };
    if ('invitePolicy' in input) next.invitePolicy = check.oneOf(input.invitePolicy, ['admins', 'members'], 'Who can invite');
    if ('shareLinks' in input) next.shareLinks = Boolean(input.shareLinks);
    settingsStore.set('sharing', next);
    return next;
  },
};

export default sharingPolicy;
