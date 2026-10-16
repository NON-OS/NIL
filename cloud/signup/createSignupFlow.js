import crypto from 'node:crypto';
import HttpError from '../lib/HttpError.js';
import randomToken from '../lib/randomToken.js';
import nameStatus from '../names/nameStatus.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import createLimiter from './createLimiter.js';
import ipKey from './ipKey.js';
import proofOfWork from './proofOfWork.js';
import siwe from './siwe.js';

const DAY = 86_400_000;
const CHALLENGE_MS = 5 * 60_000;
const MAX_PENDING = 5000;

// Sign-up, step by step, without any HTTP: check a name, write the wallet message, verify the
// signature and create the workspace, then hand over its setup token exactly once. IP addresses
// only ever reach the in-memory limiters; wallets are counted from the control database.
export default function createSignupFlow(ctx, { provision, now = () => Date.now() }) {
  const { config } = ctx;
  const rules = config.signup;
  const limits = {
    names: createLimiter({ windowMs: 60_000, max: rules.nameChecksPerIp, now }),
    challenges: createLimiter({ windowMs: 15 * 60_000, max: rules.challengesPerIp, now }),
    perIpDay: createLimiter({ windowMs: DAY, max: rules.perIpPerDay, now }),
    perHour: createLimiter({ windowMs: 3_600_000, max: rules.perHour, now }),
  };
  const challenges = new Map();
  const tickets = new Map();

  const hit = (limiter, key, message) => {
    const result = limiter.hit(key);
    if (!result.ok) throw HttpError.tooMany(message, result.retryAfterSec);
  };

  function expire(map) {
    const t = now();
    for (const [key, value] of map) if (value.expires <= t) map.delete(key);
    while (map.size >= MAX_PENDING) map.delete(map.keys().next().value);
  }

  function closed() {
    if (!rules.open) return 'Sign-ups are closed right now. Please try again later.';
    if (ctx.store.workspaces.countLive() >= rules.maxWorkspaces) return 'This server is full for now. Please try again later.';
    return null;
  }

  function walletLimits(address) {
    if (ctx.store.workspaces.countByOwner(address) >= rules.perWallet) throw HttpError.forbidden(`This wallet already has ${rules.perWallet} workspaces, the most one wallet can have here.`);
    if (ctx.store.workspaces.countByOwnerSince(address, now() - DAY) >= rules.perWalletPerDay) throw HttpError.tooMany('This wallet has created enough workspaces for today. Please try again tomorrow.', 3600);
  }

  const statement = (name) => `Create the workspace ${name}.${config.domain} on hosted Nil${config.links.terms ? `, accepting the terms at ${config.links.terms}` : ''}.`;

  return {
    closed,

    checkName(name, ip) {
      hit(limits.names, ipKey(ip), 'Too many lookups. Wait a minute and try again.');
      return nameStatus(ctx, name);
    },

    challenge({ name, address, chainId } = {}, ip) {
      hit(limits.challenges, ipKey(ip), 'Too many attempts. Wait a few minutes and try again.');
      const reason = closed();
      if (reason) throw new HttpError(503, reason);
      if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
      const status = nameStatus(ctx, name);
      if (!status.available) throw new HttpError(409, status.reason);
      const owner = address.toLowerCase();
      walletLimits(owner);

      expire(challenges);
      const issued = new Date(now());
      const message = siwe.message({
        host: config.signupHost,
        origin: `https://${config.signupHost}`,
        address,
        statement: statement(status.name),
        nonce: crypto.randomBytes(12).toString('hex'),
        chainId: Number.isSafeInteger(chainId) && chainId > 0 ? chainId : 1,
        issuedAt: issued.toISOString(),
        expiresAt: new Date(issued.getTime() + CHALLENGE_MS).toISOString(),
      });
      const challengeId = randomToken(18);
      challenges.set(challengeId, { name: status.name, owner, message, expires: issued.getTime() + CHALLENGE_MS });
      return { challengeId, message, pow: { salt: challengeId, bits: rules.powBits } };
    },

    verify({ challengeId, signature, nonce } = {}, ip) {
      const pending = typeof challengeId === 'string' ? challenges.get(challengeId) : undefined;
      if (pending) challenges.delete(challengeId);
      if (!pending || pending.expires <= now()) throw HttpError.badRequest('That request expired. Please start again.');
      if (!proofOfWork.verify(challengeId, nonce, rules.powBits)) throw HttpError.badRequest('The browser check didn’t finish. Reload the page and try again.');
      if (siwe.recover(pending.message, signature) !== pending.owner) throw new HttpError(401, 'That signature doesn’t match the wallet.');
      const reason = closed();
      if (reason) throw new HttpError(503, reason);
      walletLimits(pending.owner);
      // counted only for a real, signed attempt, so mistyping a name doesn't use up the day
      hit(limits.perIpDay, ipKey(ip), 'Enough workspaces have been created from your network today. Please try again tomorrow.');
      hit(limits.perHour, 'all', 'Many workspaces are being created right now. Please try again in a few minutes.');

      const workspace = createWorkspace(ctx, { name: pending.name, owner: pending.owner });
      // failures are recorded, logged and alerted inside; the person sees them via status()
      provision(workspace.id).catch(() => {});
      expire(tickets);
      const ticket = randomToken(24);
      tickets.set(ticket, { workspaceId: workspace.id, expires: now() + rules.ticketMinutes * 60_000 });
      return { ticket, name: workspace.name, url: `https://${workspace.name}.${config.domain}` };
    },

    // The setup token goes out once, to whoever holds the ticket from verify(): the person whose
    // wallet just signed. After that only the operator can see it, until the workspace is claimed.
    status(ticket) {
      const entry = typeof ticket === 'string' ? tickets.get(ticket) : undefined;
      if (!entry || entry.expires <= now()) throw new HttpError(404, 'This sign-up session has ended.');
      const workspace = ctx.store.workspaces.get(entry.workspaceId);
      if (workspace?.state === 'provisioning') return { state: 'provisioning' };
      tickets.delete(ticket);
      if (workspace?.state === 'active') return { state: 'ready', url: `https://${workspace.name}.${config.domain}`, setupToken: workspace.setupToken };
      return { state: 'failed', message: 'Your workspace couldn’t be started. The operator has been alerted. Please try again later.' };
    },
  };
}
