import type CallView from './CallView';
import type CallSettings from './CallSettings';
import type ActiveCall from './ActiveCall';

export default interface CallState {
  settings: CallSettings | null;
  // calls this person can see: theirs, the ones ringing them, and the team's project calls
  live: Record<string, CallView>;
  // calls ringing this person right now
  ringing: string[];
  active: ActiveCall | null;
  // the device check before joining, and in a call
  devices: { open: boolean; join: { callId: string; video: boolean } | null };
  // the last thing worth saying out loud to screen readers
  notice: { id: number; text: string } | null;
}
