import '../components/settings/Settings.css';
import { Building2, Database, FolderKanban, Tag, UserRound, Users } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import ProfileSettings from '../components/settings/ProfileSettings';
import WorkspaceSettings from '../components/settings/WorkspaceSettings';
import TeamSettings from '../components/settings/TeamSettings';
import LabelSettings from '../components/settings/LabelSettings';
import ProjectSettings from '../components/settings/ProjectSettings';
import DataSettings from '../components/settings/DataSettings';
import useRoute from '../hooks/useRoute';
import router from '../lib/router';

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound, view: ProfileSettings },
  { id: 'team', label: 'Team', icon: Users, view: TeamSettings },
  { id: 'workspace', label: 'Workspace', icon: Building2, view: WorkspaceSettings },
  { id: 'projects', label: 'Projects', icon: FolderKanban, view: ProjectSettings },
  { id: 'labels', label: 'Labels', icon: Tag, view: LabelSettings },
  { id: 'data', label: 'Data & privacy', icon: Database, view: DataSettings },
];

export default function SettingsView() {
  const { query } = useRoute();
  const active = TABS.find((t) => t.id === query.get('tab')) ?? TABS[0];
  const View = active.view;

  return (
    <div className="main">
      <ViewHeader title="Settings" />
      <div className="page">
        <div className="settings">
          <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
            {TABS.map(({ id, label, icon: Icon }) => (
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
