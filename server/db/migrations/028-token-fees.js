// What the token itself kept of a payment, in its smallest unit. NOX can take a fee on transfers
// between wallets; a payment that arrives short by exactly that fee was sent in full, so it
// counts as paid, while `amount` stays what actually arrived.
const tokenFees = `
  ALTER TABLE payments ADD COLUMN token_fee TEXT NOT NULL DEFAULT '0';
  ALTER TABLE billing_payments ADD COLUMN token_fee TEXT NOT NULL DEFAULT '0';
`;

export default tokenFees;
