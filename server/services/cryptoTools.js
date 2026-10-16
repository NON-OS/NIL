import sql from '../db/sql.js';

// One switch for the crypto tools: bounties, votes, proof of work, private payouts and the
// token holder door. Read from the database every time, so a restored capsule or a fresh setup
// is picked up at once. Before setup there is no workspace row, and the tools count as on.
const cryptoTools = {
  on() {
    const row = sql.get('SELECT crypto_tools FROM workspace WHERE id = 1');
    return row ? row.crypto_tools === 1 : true;
  },

  set(on) {
    sql.run('UPDATE workspace SET crypto_tools = ? WHERE id = 1', on ? 1 : 0);
  },
};

export default cryptoTools;
