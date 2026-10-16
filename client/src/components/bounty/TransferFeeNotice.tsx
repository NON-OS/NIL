import useStore from '../../state/useStore';
import isAdminUser from '../../lib/isAdmin';

// Shown to admins while NOX keeps a fee on transfers between wallets, which its governance can
// switch on. Payments still count, but whoever is paid gets that much less than the amount shown.
export default function TransferFeeNotice() {
  const nox = useStore((s) => s.nox);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const bps = nox?.transferFeeBps ?? 0;
  if (!isAdmin || bps <= 0) return null;
  const percent = `${bps / 100}%`;
  return (
    <p className="plan-callout warn" role="status">
      {nox!.symbol} now keeps {percent} of every transfer between wallets, a fee set by the token’s governance. A payment of the exact amount Nil asks for arrives {percent} short; Nil still recognises it and counts it as paid in full, so the contributor or treasury receives {percent} less than the amount shown.
    </p>
  );
}
