// Plain words for the operator, by the code a workspace's billing watchdog reports in /healthz.
const TEXT = {
  watch_failing: 'Its Nil Pro payment checks haven’t got through to its Ethereum node for hours. Payments sent meanwhile count once the node answers; check the node it uses.',
  payments_final_wait: 'A Nil Pro payment has waited hours for a final block. It counts once the node reports the block final.',
  payments_missing: 'A Nil Pro payment is out of its block after a reorg or a lagging node. The workspace keeps looking for it and lets the invoice expire if it never comes back.',
  invoices_overdue: 'An invoice is still open hours after its payment window, held by a payment on its way. It settles or expires by itself.',
  perk_checks_overdue: 'Its Zero-State Pass and staking checks are overdue because the Ethereum node didn’t answer. They run again once it does.',
  bounty_pending: 'A bounty payment has been waiting on the chain for hours. It settles once the node answers.',
};

// Tells the operator about every running workspace whose billing watchdog reports a stall. Its
// owners and admins already have a notice in the app; this copy is for whoever runs the hosts
// and the Ethereum node. The alerter repeats it at most every CLOUD_ALERT_REPEAT_MIN while it lasts.
export default async function checkBilling(ctx) {
  for (const workspace of ctx.store.workspaces.list({ states: ['active'] })) {
    const codes = (await ctx.driver.status(workspace.id).catch(() => null))?.report?.billingStalled ?? [];
    if (!codes.length) continue;
    const message = codes.map((code) => TEXT[code] ?? `Its billing watchdog reports "${code}".`).join(' ');
    await ctx.alert('workspace.billing_stalled', { workspace, message });
  }
}
