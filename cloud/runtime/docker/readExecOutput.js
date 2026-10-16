// Exec output without a TTY is multiplexed: an 8-byte frame header (stream id, 3 zero bytes,
// big-endian length) before each piece of stdout or stderr. The output comes from inside a
// workspace, so it is never trusted to be small: frames are consumed as they arrive, at most
// `limit` bytes of each stream are kept, and a process that keeps talking is cut off.
export default async function readExecOutput(stream, limit = 64 * 1024) {
  const kept = { stdout: [], stderr: [] };
  const sizes = { stdout: 0, stderr: 0 };
  let header = Buffer.alloc(0);
  let remaining = 0;
  let which = 'stdout';
  let total = 0;

  for await (const chunk of stream) {
    total += chunk.length;
    if (total > limit * 16) {
      stream.destroy();
      break;
    }
    let data = chunk;
    while (data.length) {
      if (!remaining) {
        const need = 8 - header.length;
        header = Buffer.concat([header, data.subarray(0, need)]);
        data = data.subarray(need);
        if (header.length < 8) break;
        which = header[0] === 2 ? 'stderr' : 'stdout';
        remaining = header.readUInt32BE(4);
        header = Buffer.alloc(0);
        continue;
      }
      const piece = data.subarray(0, remaining);
      const room = limit - sizes[which];
      if (room > 0) {
        kept[which].push(piece.subarray(0, room));
        sizes[which] += Math.min(room, piece.length);
      }
      remaining -= piece.length;
      data = data.subarray(piece.length);
    }
  }
  return { stdout: Buffer.concat(kept.stdout).toString('utf8'), stderr: Buffer.concat(kept.stderr).toString('utf8') };
}
