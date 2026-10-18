import masterKeys from './masterKeys';
import poolSecrets from './poolSecrets';
import noteSecrets from './noteSecrets';
import noteSeal from './noteSeal';
import poolKeySeal from './poolKeySeal';
import poolPhrase from './poolPhrase';
import treeProof from './treeProof';
import proveWithdrawal from './proveWithdrawal';
import proveCommitment from './proveCommitment';
import poolCalls from './poolCalls';
import withdrawalContext from './withdrawalContext';
import grossAmount from './grossAmount';
import relayTerms from './relayTerms';
import rebuildNotes from './rebuildNotes';

// Everything heavy the pool screens need (Poseidon, the BIP-39 word list, the Merkle tree and
// the prover), in one chunk that loads only when an admin opens the team's pool.
const poolKit = { masterKeys, poolSecrets, noteSecrets, noteSeal, poolKeySeal, poolPhrase, treeProof, proveWithdrawal, proveCommitment, poolCalls, withdrawalContext, grossAmount, relayTerms, rebuildNotes };

export default poolKit;
