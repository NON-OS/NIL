// 0x1234…abcd: enough to recognise a wallet without filling the screen with hex.
export default function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
