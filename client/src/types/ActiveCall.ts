import type CallView from './CallView';
import type CallPeer from './CallPeer';

// The call this tab is in.
export default interface ActiveCall {
  id: string;
  view: CallView;
  phase: 'joining' | 'live';
  mic: boolean;
  cam: boolean;
  screen: boolean;
  // the microphone or camera couldn't be opened, so the call goes on without it
  micBlocked: boolean;
  camBlocked: boolean;
  speaking: boolean;
  local: MediaStream | null;
  localScreen: MediaStream | null;
  peers: Record<string, CallPeer>;
  layout: 'grid' | 'speaker';
  minimized: boolean;
  // who the speaker layout shows large; null follows whoever is talking
  pinned: string | null;
  // where call sound plays, where the browser lets a page choose
  speaker: string | null;
  // everyone this person has been connected to in this call, for "no answer" and "they left"
  everConnected: boolean;
}
