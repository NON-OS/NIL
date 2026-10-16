import tarBlocks from './tarBlocks.js';

const octal = (value, length) => `${value.toString(8).padStart(length - 1, '0')}\0`;

// One complete ustar entry (header, data, padding) for a file or directory the control plane
// writes itself, such as the backup manifest or the empty files that reset a SQLite WAL.
// Ownership is left at 0: extraction assigns the workspace's own user.
export default function tarEntry({ name, data = Buffer.alloc(0), type = 'file', mode = type === 'dir' ? 0o700 : 0o600, mtime = Math.floor(Date.now() / 1000) }) {
  const block = Buffer.alloc(512);
  block.write(octal(mode, 8), 100, 'ascii');
  block.write(octal(0, 8), 108, 'ascii');
  block.write(octal(0, 8), 116, 'ascii');
  block.write(octal(type === 'dir' ? 0 : data.length, 12), 124, 'ascii');
  block.write(octal(mtime, 12), 136, 'ascii');
  block.write(type === 'dir' ? '5' : '0', 156, 'ascii');
  block.write('ustar\0', 257, 'ascii');
  block.write('00', 263, 'ascii');
  tarBlocks.setName(block, type === 'dir' && !name.endsWith('/') ? `${name}/` : name);
  return type === 'dir' ? block : Buffer.concat([block, data, tarBlocks.padding(data.length)]);
}
