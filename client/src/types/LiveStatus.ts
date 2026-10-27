// Where an open doc stands. 'sending': changes on their way to the server. 'offline': the server
// can't be reached, so changes wait in this tab. 'readonly': the newest version failed its check,
// so nothing more is written to it.
export default interface LiveStatus {
  state: 'saved' | 'sending' | 'offline' | 'readonly';
  // changes from others that failed their check and were left out
  refused: number;
}
