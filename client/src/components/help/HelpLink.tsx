import './HelpLink.css';
import { CircleHelp } from 'lucide-react';
import router from '../../lib/router';

interface Props {
  topic: string;
  label: string;
  // inside a dialog, a new tab keeps whatever was typed there
  newTab?: boolean;
}

// The small "?" next to a feature. It opens that feature's page in the help center.
export default function HelpLink({ topic, label, newTab = false }: Props) {
  const to = `/help/${topic}`;
  return (
    <a className="help-link" href={to} title={label} aria-label={label} {...(newTab ? { target: '_blank', rel: 'noopener' } : { onClick: router.link(to) })}>
      <CircleHelp />
    </a>
  );
}
