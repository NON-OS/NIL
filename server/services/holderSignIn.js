import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import nox from '../lib/nox.js';
import dateText from '../lib/dateText.js';
import sessions from '../auth/sessions.js';
import hub from '../realtime/hub.js';
import holdings from './holdings.js';
import holderStanding from './holderStanding.js';

// People who came in through the open door have to keep holding to keep coming in. Falling
// below starts a grace period with a notice; only after it are they turned away, and any
// session they still have ends with it.
export default async function holderSignIn(userId, gate) {
  const held = (await holdings(userId)).total;
  const standing = holderStanding(userId, held, gate.minimum);
  if (standing.state !== 'locked') return;
  sessions.revokeAll(userId);
  hub.disconnect(userId);
  const hours = config.holders.recheckHours;
  if (held >= BigInt(gate.minimum)) {
    throw HttpError.forbidden(`Your linked wallets hold enough again. The grace period ended on ${dateText(standing.until)}, so Nil lets you back in once its regular checks, every ${hours} hours, have seen at least ${nox(gate.minimum)} there for ${hours} hours.`);
  }
  throw HttpError.forbidden(`Your linked wallets hold ${nox(held)} counting NOX held, staked and Zero-State Passes. This workspace asks members who joined as holders to keep at least ${nox(gate.minimum)}, and the grace period ended on ${dateText(standing.until)}.`);
}
