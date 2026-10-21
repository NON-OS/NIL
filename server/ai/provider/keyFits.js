// Whether the saved key may go with a request to this provider. A key saved for one provider is
// never sent to another, and for an OpenAI-compatible one that means the same address too, so
// changing the address without entering the key again can't carry the key somewhere new.
export default function keyFits(row, kind, baseUrl) {
  return Boolean(row?.key_ct) && row.kind === kind && (kind !== 'compatible' || row.base_url === baseUrl);
}
