import sessionAccounts from './sessionAccounts';
import type PhoneSession from '../../types/PhoneSession';

// After a reload, the session to carry on with: the newest one that hasn't run out and still
// has an Ethereum account in it.
export default function liveSession(sessions: PhoneSession[], now = Date.now()): PhoneSession | null {
  const live = sessions.filter((s) => s.expiry * 1000 > now && sessionAccounts(s).length > 0);
  return live.sort((a, b) => b.expiry - a.expiry)[0] ?? null;
}
