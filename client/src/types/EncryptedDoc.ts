import type EncryptedUpdate from './EncryptedUpdate';

// A doc exactly as the server stores and returns it: ciphertext plus your sealed key.
export default interface EncryptedDoc {
  id: string;
  titleCt: string;
  bodyCt?: string;
  version: number;
  audience: 'team' | 'people';
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: number;
  updatedAt: number;
  wrappedKey: string;
  readers: string[];
  // when opened: how far into the live changes this version reaches, and the changes after it
  updatesThrough?: number;
  // how many times the doc moved to a new key; live changes carry it
  keyEpoch?: number;
  // pictures and files waiting to be encrypted again after someone was taken out, and fresh
  // copies already made for them
  reseal?: { waiting: string[]; copies: { id: string; replaces: string }[] } | null;
  updates?: EncryptedUpdate[];
  // more changes wait after the last of `updates`, to be fetched
  updatesMore?: boolean;
}
