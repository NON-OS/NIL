// Posts an anonymous ballot the way a browser does: no cookie, just the CSRF header and the proof.
export default function castAnonymous(base, proposalId, body) {
  return fetch(`${base}/api/anonymous-ballots/${proposalId}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));
}
