// The tables that hold the server's own billing record. Erasing the workspace and restoring a
// capsule both skip them: a payment can't count twice, the trial can't start over, and a
// capsule can't bring paid time with it.
const billingTables = Object.freeze(['billing_state', 'billing_invoices', 'billing_amounts', 'billing_payments']);

export default billingTables;
