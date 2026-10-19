// An error with an EIP-1193 code, the way a browser wallet reports one.
export default function rpcError(code: number, message: string) {
  return Object.assign(new Error(message), { code });
}
