import { BookOpen, PhoneOff, WifiOff } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import router from '../../lib/router';

const SETUP = '/help/calls#set-up-calls';

// Why calls can't be made here, and what would change that: for whoever runs the server, the
// steps; for everyone else, who to ask.
export default function CallsNotReady({ reason, admin }: { reason: string; admin: boolean }) {
  const help = (
    <a className="btn" href={SETUP} onClick={router.link(SETUP)}>
      <BookOpen /> {admin ? 'Open the setup guide' : 'How calls work'}
    </a>
  );

  if (reason === 'tor') {
    return (
      <EmptyState icon={<WifiOff />} title="Calls don’t work over Tor" actions={help}>
        Tor carries only TCP, and a call needs UDP between the browsers in it. Open Nil at its usual address to make calls. Docs, tasks, chat and files work here as usual.
      </EmptyState>
    );
  }

  if (reason === 'off') {
    return (
      <EmptyState icon={<PhoneOff />} title="Calls are turned off on this server" actions={admin ? help : undefined}>
        {admin ? 'The server has CALLS=off in its settings. Remove it, or set it to on, and restart Nil to turn calls on.' : 'Whoever runs this server turned calls off. Ask an admin if you need them.'}
      </EmptyState>
    );
  }

  if (!admin) {
    return (
      <EmptyState icon={<PhoneOff />} title="Calls aren’t set up yet" actions={help}>
        Calls need a relay server, so nobody in a call learns anyone else’s IP address. Ask an admin of this workspace to set one up. It takes a few minutes.
      </EmptyState>
    );
  }

  return (
    <div className="calls-setup panel">
      <div className="panel-head">
        <h2>
          <PhoneOff aria-hidden="true" /> Set up calls
        </h2>
      </div>
      <div className="panel-body">
        <p>Calls need a TURN relay, so nobody in a call learns anyone else’s IP address. Nil comes with one, coturn, ready to run beside it. On the server:</p>
        <ol className="calls-setup-steps">
          <li>
            Point a host name such as <code>turn.example.com</code> at the server, and get a TLS certificate for it.
          </li>
          <li>
            Make a secret with <code>openssl rand -hex 32</code> and add <code>TURN_URLS</code>, <code>TURN_SECRET</code>, <code>TURN_REALM</code>, <code>TURN_EXTERNAL_IP</code>, <code>TURN_CERT_DIR</code> and <code>COMPOSE_PROFILES=calls</code> to <code>.env</code>.
          </li>
          <li>
            Open 3478 over UDP and TCP, 5349 over TCP, and 49160 to 49999 over UDP in the firewall.
          </li>
          <li>
            Run <code>docker compose up -d</code>. Calls turn on by themselves once Nil sees the relay.
          </li>
        </ol>
        <p className="muted">For calls of more than four, the guide also sets up the SFU, which forwards video it can’t decrypt.</p>
        <div className="calls-setup-actions">{help}</div>
      </div>
    </div>
  );
}
