import '../components/auth/Auth.css';
import { useEffect, useState } from 'react';
import AuthPitch from '../components/auth/AuthPitch';
import LoginPanel from '../components/auth/LoginPanel';
import JoinPanel from '../components/auth/JoinPanel';
import RestorePanel from '../components/auth/RestorePanel';
import useStore from '../state/useStore';
import useRoute from '../hooks/useRoute';
import http from '../api/http';
import formatUnits from '../lib/formatUnits';

interface InviteInfo {
  valid: boolean;
  workspace?: { name: string };
}

export default function AuthView() {
  const needsSetup = useStore((s) => s.needsSetup);
  const holderGate = useStore((s) => s.holderGate);
  const workspace = useStore((s) => s.workspace);
  const [holderJoin, setHolderJoin] = useState(false);
  const { segments } = useRoute();
  const inviteToken = segments[0] === 'invite' ? segments[1] : undefined;
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    http
      .get<InviteInfo>(`/auth/invite/${encodeURIComponent(inviteToken)}`)
      .then(setInvite)
      .catch(() => setInvite({ valid: false }));
  }, [inviteToken]);

  let panel;
  if (inviteToken) {
    panel = !invite ? null : invite.valid ? (
      <JoinPanel mode="invite" inviteToken={inviteToken} workspaceName={invite.workspace?.name} />
    ) : (
      <div className="auth-card">
        <h1>This invite can’t be used</h1>
        <div className="auth-error">It has expired or was already used. Ask your admin for a new link.</div>
      </div>
    );
  } else if (needsSetup) {
    panel = restoring ? <RestorePanel onBack={() => setRestoring(false)} /> : <JoinPanel mode="setup" onRestore={() => setRestoring(true)} />;
  } else if (holderJoin && holderGate) {
    const requirement = `You need at least ${formatUnits(holderGate.minimum, holderGate.decimals)} ${holderGate.symbol} in this wallet, and you’ll need to keep holding it to sign in later.`;
    panel = <JoinPanel mode="holder" workspaceName={workspace.name} requirement={requirement} onBack={() => setHolderJoin(false)} />;
  } else {
    panel = <LoginPanel onHolderJoin={holderGate ? () => setHolderJoin(true) : undefined} />;
  }

  return (
    <div className="auth">
      <AuthPitch />
      <main className="auth-main">{panel}</main>
    </div>
  );
}
