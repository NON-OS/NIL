// Where an open doc stands. 'sending': changes on their way to the server. 'offline': the server
// can't be reached, so changes wait here. 'unsaved': the server answered but wouldn't take a
// version or a change, and `problem` says why. 'readonly': the newest version failed its check,
// so nothing more is written to it.
export default interface LiveStatus {
  state: 'saved' | 'sending' | 'offline' | 'unsaved' | 'readonly';
  // changes from others that failed their check and were left out
  refused: number;
  // what the server said when it refused, for 'unsaved'
  problem?: string;
}
