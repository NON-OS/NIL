// One plain word for where an invoice stands; see the server's invoiceView for each meaning.
type InvoiceState = 'waiting' | 'seen' | 'confirming' | 'underpaid' | 'paid' | 'overpaid' | 'expired' | 'cancelled';

export default InvoiceState;
