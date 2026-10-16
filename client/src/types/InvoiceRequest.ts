// What an admin asks an invoice for: periods of Pro, or seats added to paid time already running.
export default interface InvoiceRequest {
  kind: 'periods' | 'seats';
  periods: number;
  people: number;
}
