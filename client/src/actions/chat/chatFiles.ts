import http from '../../api/http';
import fileCipher from '../../lib/crypto/fileCipher';
import b64u from '../../lib/crypto/b64u';
import fileMeta from '../../lib/fileMeta';
import stripImageMetadata from '../../lib/images/stripImageMetadata';
import type ChatFile from '../../types/ChatFile';

const digest = async (bytes: Uint8Array) => b64u.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
// the seal a chat file is encrypted under names its conversation, so the ciphertext opens nowhere else
const seal = (channelId: string) => `chat.${channelId}`;

// Files in messages, sealed the way files on private tasks are (see fileCipher), each under a
// fresh key of its own. The key, name, type, size and hash go in the message, which its sender
// signs; the server keeps encrypted bytes under an id and nothing else. Pictures lose their
// location and camera details before anything is encrypted.
const chatFiles = {
  async upload(channelId: string, file: File): Promise<ChatFile> {
    const { name, type } = fileMeta(file.name, file.type);
    const bytes = stripImageMetadata.run(new Uint8Array(await file.arrayBuffer()), type);
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    try {
      const body = await fileCipher.seal(key, seal(channelId), id, 'bytes', bytes);
      await http.send(`/chat/channels/${channelId}/files`, new Blob([body]), { 'X-Chat-File': id });
      return { id, name, type, size: bytes.length, hash: await digest(bytes), key: b64u.encode(key) };
    } finally {
      key.fill(0);
    }
  },

  // The file's bytes, which have to be the very ones its sender signed for.
  async open(channelId: string, file: ChatFile) {
    const blob = await http.bytes(`/chat/files/${file.id}`);
    try {
      const bytes = await fileCipher.open(b64u.decode(file.key), seal(channelId), file.id, 'bytes', blob);
      if (bytes.length !== file.size || (await digest(bytes)) !== file.hash) throw new Error('changed');
      return bytes;
    } catch {
      throw new Error('This file couldn’t be decrypted and checked here.');
    }
  },
};

export default chatFiles;
