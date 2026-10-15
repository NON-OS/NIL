// The unlocked encryption key lives only in this tab's memory. It's never written to disk,
// storage or the server, and it's gone on reload, sign-out or closing the tab.
let identity: { privateKey: Uint8Array; publicKey: Uint8Array } | null = null;
const docKeys = new Map<string, Uint8Array>();

const keyring = {
  identity: () => identity,
  unlock(next: { privateKey: Uint8Array; publicKey: Uint8Array }) {
    identity = next;
  },
  docKey: (docId: string) => docKeys.get(docId),
  rememberDocKey: (docId: string, key: Uint8Array) => docKeys.set(docId, key),
  forgetDocKey: (docId: string) => docKeys.delete(docId),
  lock() {
    identity?.privateKey.fill(0);
    identity = null;
    for (const key of docKeys.values()) key.fill(0);
    docKeys.clear();
  },
};

export default keyring;
