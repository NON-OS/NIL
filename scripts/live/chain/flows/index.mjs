import signIn from './signIn.mjs';
import bounties from './bounties.mjs';
import privatePayouts from './privatePayouts.mjs';
import pro from './pro.mjs';
import holderDoor from './holderDoor.mjs';
import votes from './votes.mjs';
import transferFee from './transferFee.mjs';

// The flows in the order they run; each one builds on the people and state the ones before it left.
// Nil Pro comes first: without a trial, bounties and the holder door need a paid plan
const flows = { signIn, pro, bounties, privatePayouts, holderDoor, votes, transferFee };

export default flows;
