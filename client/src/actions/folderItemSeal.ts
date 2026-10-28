import store from '../state/store';
import keyring from '../state/keyring';
import itemFacts, { type ItemFacts } from '../lib/crypto/itemFacts';
import itemMeta from '../lib/crypto/itemMeta';
import signedFacts from '../lib/crypto/signedFacts';
import keyHash from '../lib/crypto/keyHash';
import type FolderItem from '../types/FolderItem';

type Facts = Omit<ItemFacts, 'version'>;

// The signed details of a file or subfolder, sealed under a key that comes from its own key and
// the folder key together, so only someone holding the folder's current key can write details
// anyone accepts.
const folderItemSeal = {
  seal(folderKey: Uint8Array, item: { id: string; folderId: string }, itemKey: Uint8Array, name: string, facts: Facts) {
    const id = keyring.identity();
    if (!id) throw new Error('Unlock your keys first.');
    const payload = signedFacts.seal(name, { kind: itemFacts.kind, place: itemFacts.place(item.folderId, item.id), facts: itemFacts.list(facts), by: store.get().me!.id, signingPrivate: id.signingPrivate });
    return itemMeta.seal(itemKey, folderKey, item.folderId, item.id, payload);
  },

  // An item's details as they stand, with one more edit and whatever `change` sets.
  facts(item: FolderItem, itemKey: Uint8Array, change: Partial<Facts> = {}): Facts {
    return {
      kind: item.kind,
      parent: item.parentId,
      type: item.type,
      size: item.size,
      hash: item.hash,
      blob: item.blob?.id ?? null,
      hashes: item.hashes?.id ?? null,
      thumb: item.thumb?.id ?? null,
      thumbHash: item.thumbHash,
      thumbSize: item.thumbSize,
      width: item.width,
      height: item.height,
      key: keyHash(itemKey),
      edit: item.edit + 1,
      at: Date.now(),
      ...change,
    };
  },
};

export default folderItemSeal;
