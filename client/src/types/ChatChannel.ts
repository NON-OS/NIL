import type ChatChannelRow from './ChatChannelRow';

// A conversation once this browser has opened its name and topic and checked who signed them.
export default interface ChatChannel extends ChatChannelRow {
  name: string;
  topic: string;
  // 'locked': no key here yet to open the name with. 'unverified': the name didn't check out,
  // so it isn't shown.
  metaState: 'ok' | 'locked' | 'unverified' | 'none';
}
