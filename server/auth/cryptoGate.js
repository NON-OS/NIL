import express from 'express';
import cryptoTools from '../services/cryptoTools.js';

// Routes that belong to the crypto tools. With the tools switched off they answer like routes
// that don't exist. Two things stay outside on purpose: the Nil Pro subscription (/plan), which
// is paid in NOX either way, and /proofs/key, which also seeds the keys behind private tasks
// and docs.
const PATHS = [
  '/bounties',
  '/payments',
  '/tasks/:id/payments',
  '/tasks/:id/applications',
  '/applications',
  '/public/bounties',
  '/proposals',
  '/vote-power',
  '/anonymous-ballots',
  '/me/semaphore',
  '/me/stealth',
  '/stealth',
  '/holder-gate',
  '/proofs/mine',
];

const cryptoGate = express.Router();

cryptoGate.use(PATHS, (req, res, next) => (cryptoTools.on() ? next() : res.status(404).json({ error: 'That isn’t available in this workspace.' })));

export default cryptoGate;
