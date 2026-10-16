// 0x1234…abcd: enough to tell owners apart on screen without printing whole addresses into
// terminal scrollback and screenshots. `info` shows the full address when it's needed.
export default function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}
