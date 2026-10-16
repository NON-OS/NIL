// Why unlocking stopped, for screens that offer a way forward. 'no-wrap': this wallet has no
// copy of your identity yet. 'mismatch': the server lists keys other than the ones this wallet
// opens. 'kit-older': a recovery kit holds keys other than the published ones.
export default class VaultError extends Error {
  readonly kind: 'no-wrap' | 'mismatch' | 'kit-older';

  constructor(kind: VaultError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}
