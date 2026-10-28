import folderFiles from './folderFiles';
import blobCipher from '../lib/crypto/blobCipher';
import b64u from '../lib/crypto/b64u';
import safeBlobType from '../lib/safeBlobType';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

type Chunk = Awaited<ReturnType<typeof folderFiles.reader>>;
interface Stream {
  chunk: Chunk;
  size: number;
  type: string;
  // the last chunks decrypted, for a player that reads the same part twice
  kept: Map<number, Uint8Array>;
}

// the most one answer to the player carries; it asks again for the rest
const MOST = 2 * 1024 * 1024;
const KEEP = 6;
const PING_MS = 1000;

const streams = new Map<string, Stream>();
let ready: Promise<boolean> | null = null;

async function chunk(s: Stream, index: number) {
  const hit = s.kept.get(index);
  if (hit) return hit;
  const plain = await s.chunk(index);
  s.kept.set(index, plain);
  if (s.kept.size > KEEP) s.kept.delete(s.kept.keys().next().value!);
  return plain;
}

// bytes `start` to `end` of the file, or as many of them as one answer carries
async function range(s: Stream, start: number, end: number | null) {
  const last = Math.min(s.size - 1, end ?? Infinity, start + MOST - 1);
  const out = new Uint8Array(last - start + 1);
  for (let i = Math.floor(start / blobCipher.CHUNK); i <= Math.floor(last / blobCipher.CHUNK); i++) {
    const plain = await chunk(s, i);
    const at = i * blobCipher.CHUNK;
    out.set(plain.subarray(Math.max(start, at) - at, Math.min(last, at + plain.length - 1) - at + 1), Math.max(start, at) - start);
  }
  return out;
}

function onMessage(e: MessageEvent) {
  if (e.data?.type !== 'nil:stream' || !e.ports[0]) return;
  const port = e.ports[0];
  const s = streams.get(e.data.token);
  const start = Number(e.data.start);
  if (!s) return port.postMessage({ status: 404 });
  if (!(start >= 0 && start < s.size)) return port.postMessage({ status: 416, total: s.size });
  range(s, start, e.data.end === null ? null : Number(e.data.end)).then(
    (bytes) => port.postMessage({ bytes, total: s.size, type: s.type }, [bytes.buffer]),
    () => port.postMessage({ status: 502 }),
  );
}

// Video and sound in Files played as they arrive, at any size, with seeking. The app's service
// worker (public/sw.js) answers the player's requests by asking this tab, which fetches and
// decrypts only the chunks a request covers and checks each against what the uploader signed.
// Keys and plaintext never leave the tab, and nothing is stored.
const mediaStreams = {
  // whether a service worker that streams controls this tab, asked once
  available(): Promise<boolean> {
    const worker = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
    if (!worker) return Promise.resolve(false);
    ready ??= new Promise((resolve) => {
      const channel = new MessageChannel();
      const answer = (ok: boolean) => {
        clearTimeout(late);
        channel.port1.close();
        resolve(ok);
      };
      const late = setTimeout(() => answer(false), PING_MS);
      channel.port1.onmessage = (e) => answer(e.data === 'nil:stream-ready');
      worker.postMessage({ type: 'nil:stream-ping' }, [channel.port2]);
    });
    return ready;
  },

  // A file that can play this way: not empty, and either one chunk or signed chunk by chunk.
  fits: (item: FolderItem) => item.size > 0 && Boolean(item.blob) && (item.blob!.chunks === 1 || Boolean(item.hashes)),

  async open(folder: SharedFolder, item: FolderItem) {
    const reader = await folderFiles.reader(folder, item);
    if (!streams.size) navigator.serviceWorker.addEventListener('message', onMessage);
    const token = b64u.encode(crypto.getRandomValues(new Uint8Array(24)));
    streams.set(token, { chunk: reader, size: item.size, type: safeBlobType(item.type), kept: new Map() });
    return {
      url: `/__nil/stream/${token}`,
      close() {
        streams.delete(token);
        if (!streams.size) navigator.serviceWorker.removeEventListener('message', onMessage);
      },
    };
  },
};

export default mediaStreams;
