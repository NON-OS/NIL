import type ChatChannelRow from './ChatChannelRow';

// A conversation once this browser has opened its name and topic and checked who signed them.
export default interface ChatChannel extends ChatChannelRow {
  name: string;
  topic: string;
  // 'locked': no key here yet to open the name with. 'unverified': the name didn't check out,
  // so it isn't shown.
  metaState: 'ok' | 'locked' | 'unverified' | 'none';
  // who holds the current key, from the newest member list that checked out; null until checked.
  // What the conversation is called and who it shows come from this, never the server's list.
  signedMembers: string[] | null;
  // who of them manage it, from the same list: what decides who may change people and settings
  signedManagers: string[] | null;
  // the disappearing and forward-secrecy settings as whoever manages it signed them, next to the
  // name; null when nobody has signed any
  signedSettings: { disappear: number | null; forward: number | null } | null;
}
