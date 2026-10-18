import crypto from 'node:crypto';
import HttpError from '../lib/HttpError.js';
import newWorkspaceId from '../lib/newWorkspaceId.js';
import randomToken from '../lib/randomToken.js';
import nameStatus from '../names/nameStatus.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import challengeToken from './challengeToken.js';
import signupLimits from './signupLimits.js';
import proofOfWork from './proofOfWork.js';
import siwe from './siwe.js';

const DAY = 86_400_000;
const CHALLENGE_MS = 5 * 60_000;
const MAX_TICKETS = 5000;

// Sign-up, step by step, without any HTTP: check a name, write the wallet message, verify the
// signature and create the workspace, then hand over its setup token exactly once. IP addresses
// only ever reach the in-memory limiters; wallets are counted from the control database.
// Challenges are sealed tokens rather than server-side entries (see challengeToken.js). Past the
// daily cap, or when the server is nearly full, a signed sign-up waits for the operator.
export default function createSignupFlow(ctx, { provision, now = () => Date.now() }) {
  const { config } = ctx;
  const rules = config.signup;
  const limits = signupLimits(rules, now);
  const tokens = challengeToken();
  // challenges already used, until they would have expired anyway, so each works once
  const spent = new Map();
  const tickets = new Map();

  function forgetOld() {
    const t = now();
    for (const [key, expires] of spent) if (expires <= t) spent.delete(key);
    for (const [key, entry] of tickets) if (entry.expires <= t) tickets.delete(key);
  }

  function closed() {
    if (!rules.open) return 'Sign-ups are closed right now. Please try again later.';
    if (ctx.store.workspaces.countLive() >= rules.maxWorkspaces) return 'This server is full for now. Please try again later.';
    return null;
  }

  // the last free places, and anything past the day's cap, go out by hand
  function needsApproval() {
    if (ctx.store.workspaces.countLive() >= (rules.maxWorkspaces * rules.approvalAbovePercent) / 100) return true;
    return ctx.store.workspaces.countCreatedSince(now() - DAY) >= rules.perDay;
  }

  function walletLimits(address) {
    const waiting = ctx.store.requests.countByOwner(address);
    if (ctx.store.workspaces.countByOwner(address) + waiting >= rules.perWallet) throw HttpError.forbidden(`This wallet already has ${rules.perWallet} workspaces, the most one wallet can have here.`);
    if (ctx.store.workspaces.countByOwnerSince(address, now() - DAY) + waiting >= rules.perWalletPerDay) throw HttpError.tooMany('This wallet has created enough workspaces for today. Please try again tomorrow.', 3600);
  }

  const statement = (name) => `Create the workspace ${name}.${config.domain} on hosted Nil${config.links.terms ? `, accepting the terms at ${config.links.terms}` : ''}.`;
  const message = (c) =>
    siwe.message({
      host: config.signupHost,
      origin: `https://${config.signupHost}`,
      address: c.address,
      statement: statement(c.name),
      nonce: c.nonce,
      chainId: c.chainId,
      issuedAt: new Date(c.issuedAt).toISOString(),
      expiresAt: new Date(c.issuedAt + CHALLENGE_MS).toISOString(),
    });

  function queue(pending) {
    const request = { id: newWorkspaceId(), name: pending.name, owner: pending.address.toLowerCase(), setupToken: randomToken() };
    try {
      ctx.store.requests.add(request);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'That address is taken.');
      throw err;
    }
    ctx.log.info('signup.waiting', { request: request.id, name: request.name, owner: ctx.walletTag(request.owner) });
    ctx.alert('signup.waiting', { message: `${ctx.store.requests.list().length} sign-up(s) wait for approval: node cli.js requests` });
    return { queued: true, name: request.name, url: `https://${request.name}.${config.domain}`, setupToken: request.setupToken, days: rules.requestDays };
  }

  return {
    closed,

    checkName(name, ip) {
      limits.nameCheck(ip);
      return nameStatus(ctx, name);
    },

    challenge({ name, address, chainId } = {}, ip) {
      limits.challenge(ip);
      const reason = closed();
      if (reason) throw new HttpError(503, reason);
      if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
      const status = nameStatus(ctx, name);
      if (!status.available) throw new HttpError(409, status.reason);
      walletLimits(address.toLowerCase());

      const fields = {
        name: status.name,
        address,
        chainId: Number.isSafeInteger(chainId) && chainId > 0 ? chainId : 1,
        nonce: crypto.randomBytes(12).toString('hex'),
        issuedAt: now(),
        bits: rules.powBits,
      };
      const challengeId = tokens.issue(fields);
      return { challengeId, message: message(fields), pow: { salt: challengeId, bits: fields.bits } };
    },

    verify({ challengeId, signature, nonce } = {}, ip) {
      const pending = tokens.open(challengeId);
      const expires = pending ? pending.issuedAt + CHALLENGE_MS : 0;
      if (!pending || expires <= now() || spent.has(challengeId)) throw HttpError.badRequest('That request expired. Please start again.');
      forgetOld();
      spent.set(challengeId, expires);
      if (!proofOfWork.verify(challengeId, nonce, pending.bits)) throw HttpError.badRequest('The browser check didn’t finish. Reload the page and try again.');
      const owner = pending.address.toLowerCase();
      if (siwe.recover(message(pending), signature) !== owner) throw new HttpError(401, 'That signature doesn’t match the wallet.');
      const reason = closed();
      if (reason) throw new HttpError(503, reason);
      walletLimits(owner);
      limits.signup(ip);
      if (needsApproval()) return queue(pending);

      const workspace = createWorkspace(ctx, { name: pending.name, owner });
      // failures are recorded, logged and alerted inside; the person sees them via status()
      provision(workspace.id).catch(() => {});
      while (tickets.size >= MAX_TICKETS) tickets.delete(tickets.keys().next().value);
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
