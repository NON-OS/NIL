import express from 'express';
import cryptoTools from '../services/cryptoTools.js';

// Routes that belong to the crypto tools. With the tools switched off they answer like routes
// that don't exist. Three things stay outside on purpose: the Nil Pro subscription (/plan), which
// is paid in NOX either way; /proofs/key, which also seeds the keys behind private tasks and
// docs; and /me/semaphore, the voting key, which also sends built-in AI requests anonymously.
const PATHS = [
  '/bounties',
  '/payments',
  '/tasks/:id/payments',
  '/tasks/:id/applications',
  '/applications',
  '/public/bounties',
  '/public/votes',
  '/proposals',
  '/vote-power',
  '/anonymous-ballots',
  '/me/stealth',
  '/stealth',
  '/holder-gate',
  '/proofs/mine',
];

const cryptoGate = express.Router();

cryptoGate.use(PATHS, (req, res, next) => (cryptoTools.on() ? next() : res.status(404).json({ error: 'That isn’t available in this workspace.' })));

export default cryptoGate;
