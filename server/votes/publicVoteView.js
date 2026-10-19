import config from '../config.js';
import parseJSON from '../lib/parseJSON.js';
import tally from '../services/tally.js';
import publicWorkspace from '../services/publicWorkspace.js';
import ballotRows from './ballotRows.js';

// What anyone sees of a public vote: the question, the options, the totals, every ballot's
// wallet, choice and power, and the block and contracts the power was read from. Nothing else
// about the workspace: no member names or ids, no other votes. A sealed vote shows its totals and
// ballots once it closes, as in the app.
export default function publicVoteView(row) {
  const visible = Boolean(row.closed_at) || !row.sealed;
  const result = tally(row);
  return {
    id: row.public_slug,
    workspace: publicWorkspace()?.name ?? null,
    title: row.title,
    body: row.body,
    options: parseJSON(row.options, []),
    sealed: Boolean(row.sealed),
    open: !row.closed_at && row.closes_at > Date.now(),
    closesAt: row.closes_at,
    closedAt: row.closed_at,
    voters: result?.voters ?? 0,
    totals: visible ? (result?.totals ?? null) : null,
    ballots: visible ? ballotRows(row.id).map(({ userId, ...ballot }) => ballot) : null,
    snapshot: {
      block: row.snapshot_block,
      chainId: config.nox.chainId,
      token: { address: config.nox.token, symbol: config.nox.symbol, decimals: config.nox.decimals },
      staking: config.power.staking,
      zsp: config.power.zsp,
      zspPower: row.zsp_power,
    },
  };
}
