import express from 'express';
import { subOrder } from '@zk-kit/baby-jubjub';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import canonical from '../votes/canonical.js';
import trusteeSeat from '../votes/encrypted/trusteeSeat.js';
import trusteeSigned from '../votes/encrypted/trusteeSigned.js';
import trusteeStatement from '../votes/encrypted/trusteeStatement.js';
import encryptedTally from '../votes/encrypted/encryptedTally.js';
import shareMatches from '../votes/encrypted/shareMatches.js';

const router = express.Router();
const anyBallot = (proposalId) => sql.get('SELECT 1 FROM held_ballots WHERE proposal_id = ? UNION ALL SELECT 1 FROM encrypted_ballots WHERE proposal_id = ? LIMIT 1', proposalId, proposalId);

// Step 3: each trustee's browser opens the shares sealed to it and checks them against the
// dealers' commitments as soon as the key is set up. The vote takes no ballot until all three
// say their shares are in order, so a complaint can only come before the first ballot. A
// complaint names the dealer and is signed by the trustee who makes it.
router.post(
  '/proposals/:id/shares-check',
  route((req) => {
    const { proposal, trustee } = trusteeSeat(req);
    if (!proposal.public_key) throw new HttpError(409, 'The vote key isn’t set up yet.');
    if (req.body?.ok === true) {
      if (trustee.shares_check?.startsWith('bad')) throw new HttpError(409, 'Your complaint about a key share is still open.');
      if (!trustee.shares_check) sql.run("UPDATE proposal_trustees SET shares_check = 'ok' WHERE proposal_id = ? AND position = ?", proposal.id, trustee.position);
      hub.broadcast({ type: 'proposals' });
      return { ok: true };
    }
    const from = Number(req.body?.from);
    if (![1, 2, 3].includes(from) || from === trustee.position) throw HttpError.badRequest('Say which trustee’s share failed.');
    if (trustee.shares_check === 'ok') throw new HttpError(409, 'You already found the shares dealt to you in order.');
    if (anyBallot(proposal.id)) throw new HttpError(409, 'Complaints about key shares are only taken before the first ballot.');
    if (sql.get("SELECT 1 FROM share_complaints WHERE proposal_id = ? AND accuser = ? AND dealer = ? AND outcome = 'answered'", proposal.id, trustee.position, from)) {
      throw new HttpError(409, `Trustee ${from} already showed that share, and it matches their commitments. Use it.`);
    }
    if (!trusteeSigned(req.user.id, trusteeStatement.complaint(proposal.id, trustee.position, req.user.id, from), req.body?.signature)) throw HttpError.badRequest('Sign the complaint with your signing key.');
    sql.tx(() => {
      sql.run('INSERT INTO share_complaints (proposal_id, accuser, dealer, signature, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', proposal.id, trustee.position, from, req.body.signature, Date.now());
      sql.run('UPDATE proposal_trustees SET shares_check = ? WHERE proposal_id = ? AND position = ?', `bad:${from}`, proposal.id, trustee.position);
    });
    hub.broadcast({ type: 'proposals' });
    return { ok: true };
  }),
);

// The dealer answers a complaint by showing the disputed share, signed. The server checks it
// against the dealer's commitments, as anyone can from the audit file. If it matches, the
// complaining trustee uses it and checks again, and the vote can open. If it doesn't, the
// dealer cheated, and the vote stays closed for good with the signed share as the evidence.
router.post(
  '/proposals/:id/share-answer',
  route((req) => {
    const { proposal, trustee } = trusteeSeat(req);
    const to = Number(req.body?.to);
    const complaint = sql.get('SELECT outcome FROM share_complaints WHERE proposal_id = ? AND accuser = ? AND dealer = ?', proposal.id, to, trustee.position);
    if (!complaint) throw HttpError.notFound('That complaint');
    if (complaint.outcome) return { outcome: complaint.outcome };
    const share = canonical.number(req.body?.share, subOrder);
    if (share === null) throw HttpError.badRequest('That isn’t a key share.');
    if (!trusteeSigned(req.user.id, trusteeStatement.answer(proposal.id, trustee.position, req.user.id, to, share), req.body?.signature)) throw HttpError.badRequest('Sign the answer with your signing key.');
    const outcome = shareMatches(encryptedTally.dealingsOf(proposal.id)[trustee.position - 1], to, share) ? 'answered' : 'failed';
    sql.tx(() => {
      sql.run('UPDATE share_complaints SET share = ?, answer_signature = ?, outcome = ? WHERE proposal_id = ? AND accuser = ? AND dealer = ?', share, req.body.signature, outcome, proposal.id, to, trustee.position);
      if (outcome === 'answered') sql.run('UPDATE proposal_trustees SET shares_check = NULL WHERE proposal_id = ? AND position = ? AND shares_check = ?', proposal.id, to, `bad:${trustee.position}`);
    });
    hub.broadcast({ type: 'proposals' });
    return { outcome };
  }),
);

export default router;
