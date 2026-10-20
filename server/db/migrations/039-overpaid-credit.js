// The part of an on-time payment beyond the most Pro time one invoice can turn into, in
// micro-USD. It becomes credit instead of time, valued at the lower of the invoice's locked rate
// and the rate when it settled.
const overpaidCredit = `
  ALTER TABLE billing_payments ADD COLUMN over_usd INTEGER NOT NULL DEFAULT 0;
`;

export default overpaidCredit;
