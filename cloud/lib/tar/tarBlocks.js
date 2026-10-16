// Low-level helpers for 512-byte ustar header blocks.
const tarBlocks = {
  // the checksum counts its own field as eight spaces
  checksum(block) {
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : block[i];
    return sum;
  },

  sign(block) {
    block.write(`${tarBlocks.checksum(block).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    return block;
  },

  // ustar splits a long path at a slash into a 155-byte prefix and a 100-byte name
  setName(block, name) {
    const bytes = Buffer.from(name);
    let prefix = Buffer.alloc(0);
    let rest = bytes;
    if (bytes.length > 100) {
      const cut = name.lastIndexOf('/', 155);
      if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`Tar path too long: ${name}`);
      prefix = Buffer.from(name.slice(0, cut));
      rest = Buffer.from(name.slice(cut + 1));
    }
    block.fill(0, 0, 100);
    block.fill(0, 345, 500);
    rest.copy(block, 0);
    prefix.copy(block, 345);
    return tarBlocks.sign(block);
  },

  padding: (size) => Buffer.alloc((512 - (size % 512)) % 512),
  padded: (size) => size + ((512 - (size % 512)) % 512),
  end: () => Buffer.alloc(1024),
};

export default tarBlocks;
