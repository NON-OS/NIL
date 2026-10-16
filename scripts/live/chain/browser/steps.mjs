import setupAndJoin from './setupAndJoin.mjs';
import payPro from './payPro.mjs';
import payBounty from './payBounty.mjs';
import privatePayout from './privatePayout.mjs';
import holderJoin from './holderJoin.mjs';
import castVotes from './castVotes.mjs';

// The browser steps in order; each one builds on what the ones before it left. Nil Pro comes
// right after sign-in, since the live check's server has no trial.
const steps = { setupAndJoin, payPro, payBounty, privatePayout, holderJoin, castVotes };

export default steps;
