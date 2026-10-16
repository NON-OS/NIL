// PAX extended header records: "<length> <key>=<value>\n", where length counts the whole
// record including its own digits.
const paxRecords = {
  parse(buffer) {
    const records = new Map();
    let at = 0;
    while (at < buffer.length) {
      const space = buffer.indexOf(0x20, at);
      if (space === -1) break;
      const length = Number(buffer.subarray(at, space).toString());
      if (!Number.isInteger(length) || length <= 0 || at + length > buffer.length) throw new Error('Malformed PAX header.');
      const record = buffer.subarray(space + 1, at + length - 1).toString('utf8');
      const eq = record.indexOf('=');
      if (eq > 0) records.set(record.slice(0, eq), record.slice(eq + 1));
      at += length;
    }
    return records;
  },

  serialize(records) {
    const parts = [];
    for (const [key, value] of records) {
      const body = ` ${key}=${value}\n`;
      let length = Buffer.byteLength(body);
      // the length prefix is part of the length, so settle it by iterating
      while (String(length).length + Buffer.byteLength(body) !== length) length = String(length).length + Buffer.byteLength(body);
      parts.push(Buffer.from(`${length}${body}`));
    }
    return Buffer.concat(parts);
  },
};

export default paxRecords;
