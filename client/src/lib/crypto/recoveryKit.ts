import { scryptAsync } from '@noble/hashes/scrypt';
import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

// The same cost as workspace capsules: about half a second per guess on a laptop, 128 MB each.
const COST = { N: 2 ** 17, r: 8, p: 1 };
// The most a kit may ask for. scrypt holds 128 * N * r bytes and its time grows with N * r * p,
// so a doctored kit asking for more could run the tab out of memory or stall it for hours. This
// allows 4 times the memory and 8 times the work of the cost above.
const MAX_MEMORY = 4 * COST.N * COST.r;
const MAX_WORK = 8 * COST.N * COST.r * COST.p;
const MIN_PASSPHRASE = 12;

export interface RecoveryKit {
  type: 'nil.recovery-kit';
  v: 1;
  origin: string;
  workspaceKey: string;
  userId: string;
  fingerprint: string;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  sealed: string;
}

type KitHeader = Omit<RecoveryKit, 'sealed'>;

// No cheaper than the cost this app writes, so guessing stays slow, and no dearer than the limits.
function fairCost({ N, r, p }: KitHeader['kdf']) {
  if (![N, r, p].every(Number.isSafeInteger)) return false;
  return N >= COST.N && r >= COST.r && p >= COST.p && N * r <= MAX_MEMORY && N * r * p <= MAX_WORK;
}

// Everything in the file except the ciphertext goes in as additional data, so a kit can't be
// edited to claim another account or a cheaper passphrase cost without failing to open.
const aad = (k: KitHeader) => utf8ToBytes(`nil/recovery-kit/v1|${k.origin}|${k.workspaceKey}|${k.userId}|${k.fingerprint}|${k.kdf.N}|${k.kdf.r}|${k.kdf.p}|${k.kdf.salt}`);
const stretch = (passphrase: string, k: KitHeader, onProgress?: (p: number) => void) =>
  scryptAsync(utf8ToBytes(passphrase.normalize('NFKC')), b64u.decode(k.kdf.salt), { N: k.kdf.N, r: k.kdf.r, p: k.kdf.p, dkLen: 32, onProgress });

// A small file holding your identity seed under a passphrase only you know (scrypt, then
// AES-256-GCM). It restores your keys after you lose every wallet that could unlock them and an
// admin links a new one to your account.
const recoveryKit = {
  minPassphrase: MIN_PASSPHRASE,

  async make(seed: Uint8Array, meta: { origin: string; workspaceKey: string; userId: string; fingerprint: string }, passphrase: string, onProgress?: (p: number) => void): Promise<RecoveryKit> {
    if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Pick a passphrase of at least ${MIN_PASSPHRASE} characters.`);
    const header: KitHeader = { type: 'nil.recovery-kit', v: 1, ...meta, kdf: { name: 'scrypt', ...COST, salt: b64u.encode(crypto.getRandomValues(new Uint8Array(16))) } };
    const key = await stretch(passphrase, header, onProgress);
    try {
      return { ...header, sealed: b64u.encode(await aesGcm.seal(key, seed, aad(header))) };
    } finally {
      key.fill(0);
    }
  },

  // Throws on a wrong passphrase or a damaged file; the caller decides whether the kit belongs here.
  async open(file: unknown, passphrase: string, onProgress?: (p: number) => void): Promise<{ seed: Uint8Array; kit: RecoveryKit }> {
    const kit = file as RecoveryKit;
    const shaped = kit?.type === 'nil.recovery-kit' && kit.v === 1 && kit.kdf?.name === 'scrypt' && [kit.origin, kit.workspaceKey, kit.userId, kit.fingerprint, kit.kdf.salt, kit.sealed].every((v) => typeof v === 'string');
    if (!shaped || !fairCost(kit.kdf)) throw new Error('That file isn’t a Nil recovery kit.');
    const key = await stretch(passphrase, kit, onProgress);
    try {
      return { seed: await aesGcm.open(key, b64u.decode(kit.sealed), aad(kit)), kit };
    } catch {
      throw new Error('That passphrase doesn’t open this recovery kit.');
    } finally {
      key.fill(0);
    }
  },
};

export default recoveryKit;
