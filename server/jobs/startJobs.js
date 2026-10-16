import config from '../config.js';
import safeJob from './safeJob.js';
import jobState from './jobState.js';
import purge from './purge.js';
import optimize from './optimize.js';
import checkPayments from './checkPayments.js';
import closeProposals from './closeProposals.js';
import sendReminders from './sendReminders.js';
import sendDueAlerts from './sendDueAlerts.js';
import recordPoolPrice from './recordPoolPrice.js';
import checkTransferFee from './checkTransferFee.js';

// Starts every background job on its interval from config. Purge and optimize also run once
// right away, so a server that restarts often still gets to them.
export default function startJobs() {
  const stopping = new AbortController();
  const { signal } = stopping;
  const schedule = [
    { run: safeJob('purge', purge, { signal }), every: config.jobs.purgeMs, now: true },
    { run: safeJob('optimize', optimize, { signal }), every: config.jobs.optimizeMs, now: true },
    { run: safeJob('payments', checkPayments, { signal }), every: config.jobs.paymentsMs },
    { run: safeJob('votes', closeProposals, { signal }), every: config.jobs.votesMs },
    { run: safeJob('reminders', sendReminders, { signal }), every: config.jobs.remindersMs },
    // it takes the current time as its argument, so the signal isn't handed on
    { run: safeJob('dueAlerts', () => sendDueAlerts(), { signal }), every: config.jobs.dueAlertsMs },
    { run: safeJob('poolPrice', recordPoolPrice, { signal }), every: config.jobs.poolPriceMs, now: true },
    { run: safeJob('transferFee', checkTransferFee, { signal }), every: config.jobs.transferFeeMs, now: true },
  ];
  const timers = schedule.map(({ run, every, now }) => {
    if (now) run();
    return setInterval(run, every).unref();
  });

  return {
    // no new runs, and jobs that check the signal stop between items
    stop() {
      for (const timer of timers) clearInterval(timer);
      stopping.abort();
    },
    idle: () => jobState.idle(),
  };
}
