import type PhoneSession from '../../types/PhoneSession';

const ACCOUNT = /^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/;

// The Ethereum accounts a phone approved for this session, as network and address. Anything
// that isn't a plain eip155 account is left out.
export default function sessionAccounts(session: PhoneSession | null | undefined) {
  const listed = session?.namespaces?.eip155?.accounts;
  if (!Array.isArray(listed)) return [];
  return listed.flatMap((entry) => {
    const match = typeof entry === 'string' ? ACCOUNT.exec(entry) : null;
    return match ? [{ chainId: Number(match[1]), address: match[2] }] : [];
  });
}
