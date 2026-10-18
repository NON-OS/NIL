import config from '../config.js';
import safeJob from './safeJob.js';
import jobState from './jobState.js';
import purge from './purge.js';
import optimize from './optimize.js';
import checkPayments from './checkPayments.js';
import closeProposals from './closeProposals.js';
import sendReminders from './sendReminders.js';
import sendDueAlerts from './sendDueAlerts.js';
import runAgentQueue from './runAgentQueue.js';
import deliverWebhooks from './deliverWebhooks.js';
import agentDueSoon from './agentDueSoon.js';
import pruneAgentData from './pruneAgentData.js';
import recordPoolPrice from './recordPoolPrice.js';
import checkTransferFee from './checkTransferFee.js';
import watchBilling from './watchBilling.js';

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
    // agents: the built-in runner's queue, webhook deliveries, due-soon notices and log pruning
    { run: safeJob('agentQueue', runAgentQueue, { signal }), every: config.agents.pollMs, now: true },
    { run: safeJob('webhooks', deliverWebhooks, { signal }), every: config.agents.pollMs, now: true },
    { run: safeJob('agentDueSoon', agentDueSoon, { signal }), every: config.jobs.agentDueSoonMs },
    { run: safeJob('agentPrune', pruneAgentData, { signal }), every: config.jobs.agentPruneMs },
    { run: safeJob('poolPrice', recordPoolPrice, { signal }), every: config.jobs.poolPriceMs, now: true },
    { run: safeJob('transferFee', checkTransferFee, { signal }), every: config.jobs.transferFeeMs, now: true },
    // on its own timer, so a payments run that hangs on a slow node is noticed rather than waited on
    { run: safeJob('billingWatchdog', () => watchBilling(), { signal }), every: config.jobs.billingWatchdogMs },
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
