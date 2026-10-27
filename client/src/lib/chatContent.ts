import fileMeta from './fileMeta';
import type ChatFile from '../types/ChatFile';

export interface Content {
  text: string;
  files: ChatFile[];
  mentions: string[];
  emoji: string | null;
  target: string | null;
}

const ID = /^[A-Za-z0-9_-]{22}$/;
const B32 = /^[A-Za-z0-9_-]{43}$/;
const LIMITS = { text: 20_000, files: 10, mentions: 100, emoji: 16 };

function file(v: any): ChatFile | null {
  if (!v || typeof v !== 'object' || !ID.test(v.id) || !B32.test(v.hash) || !B32.test(v.key) || !Number.isSafeInteger(v.size) || v.size < 0) return null;
  const { name, type } = fileMeta(v.name, v.type);
  return { id: v.id, name, type, size: v.size, hash: v.hash, key: v.key };
}

// What a message says, as its sender's browser wrote it: words, files with their keys, who it
// mentions, and for a reaction its emoji and the message it's on. Another member wrote this, so
// every part is checked and cut to size before anything shows it; it's only ever shown as text.
const chatContent = {
  limits: LIMITS,

  parse(json: string): Content {
    const v = JSON.parse(json);
    if (!v || typeof v !== 'object') throw new Error('This message isn’t one Nil can read.');
    const files = Array.isArray(v.files) ? v.files.slice(0, LIMITS.files).map(file) : [];
    if (files.includes(null)) throw new Error('This message carries a file Nil can’t read.');
    return {
      text: typeof v.text === 'string' ? v.text.slice(0, LIMITS.text) : '',
      files: files as ChatFile[],
      mentions: Array.isArray(v.mentions) ? [...new Set(v.mentions.filter((m: unknown) => typeof m === 'string' && m.length <= 64))].slice(0, LIMITS.mentions) as string[] : [],
      emoji: typeof v.emoji === 'string' && v.emoji.length <= LIMITS.emoji ? v.emoji : null,
      target: typeof v.target === 'string' && ID.test(v.target) ? v.target : null,
    };
  },

  write: (c: Partial<Content>) => JSON.stringify({ text: c.text ?? '', ...(c.files?.length ? { files: c.files } : {}), ...(c.mentions?.length ? { mentions: c.mentions } : {}), ...(c.emoji ? { emoji: c.emoji, target: c.target } : {}) }),
};

export default chatContent;
