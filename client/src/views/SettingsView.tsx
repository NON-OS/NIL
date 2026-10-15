import '../components/settings/Settings.css';
import { BadgeCheck, Bot, Building2, Database, FolderKanban, ShieldCheck, Tag, UserRound, Users } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import ProfileSettings from '../components/settings/ProfileSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import WorkspaceSettings from '../components/settings/WorkspaceSettings';
import TeamSettings from '../components/settings/TeamSettings';
import LabelSettings from '../components/settings/LabelSettings';
import ProjectSettings from '../components/settings/ProjectSettings';
import DataSettings from '../components/settings/DataSettings';
import AiSettings from '../components/settings/AiSettings';
import PlanSettings from '../components/settings/PlanSettings';
import useRoute from '../hooks/useRoute';
import router from '../lib/router';
import useStore from '../state/useStore';

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound, view: ProfileSettings },
  { id: 'security', label: 'Sign-in & security', icon: ShieldCheck, view: SecuritySettings },
  { id: 'team', label: 'Team', icon: Users, view: TeamSettings },
  { id: 'workspace', label: 'Workspace', icon: Building2, view: WorkspaceSettings },
  { id: 'plan', label: 'Plan', icon: BadgeCheck, view: PlanSettings },
  { id: 'projects', label: 'Projects', icon: FolderKanban, view: ProjectSettings },
  { id: 'labels', label: 'Labels', icon: Tag, view: LabelSettings },
  { id: 'ai', label: 'Connect AI', icon: Bot, view: AiSettings },
  { id: 'data', label: 'Data & privacy', icon: Database, view: DataSettings },
];

export default function SettingsView() {
  const { query } = useRoute();
  const guest = useStore((s) => s.guest);
  // guests manage their own account; workspace-wide settings belong to members
  const tabs = guest ? TABS.filter((t) => ['profile', 'security', 'ai'].includes(t.id)) : TABS;
  const active = tabs.find((t) => t.id === query.get('tab')) ?? tabs[0];
  const View = active.view;

  return (
    <div className="main">
      <ViewHeader title="Settings" />
      <div className="page">
        <div className="settings">
          <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={active.id === id} onClick={() => router.navigate(`/settings?tab=${id}`, { replace: true })}>
                <Icon /> {label}
              </button>
            ))}
          </nav>
          <div>
            <View />
          </div>
        </div>
      </div>
    </div>
  );
}
