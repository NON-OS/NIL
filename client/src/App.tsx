import { useState } from 'react';
import Sidebar from './components/shell/Sidebar';
import AppEffects from './components/shell/AppEffects';
import TaskDrawer from './components/drawer/TaskDrawer';
import QuickAdd from './components/overlays/QuickAdd';
import CommandPalette from './components/overlays/CommandPalette';
import ShortcutsHelp from './components/overlays/ShortcutsHelp';
import ExtractModal from './components/overlays/ExtractModal';
import ProjectModal from './components/overlays/ProjectModal';
import Toasts from './components/ui/Toasts';
import BrandArt from './components/brand/BrandArt';
import Spinner from './components/ui/Spinner';
import AuthView from './views/AuthView';
import MyWorkView from './views/MyWorkView';
import InboxView from './views/InboxView';
import BoardView from './views/BoardView';
import ListView from './views/ListView';
import CalendarView from './views/CalendarView';
import GoalsView from './views/GoalsView';
import InsightsView from './views/InsightsView';
import ProjectView from './views/ProjectView';
import SettingsView from './views/SettingsView';
import NotFoundView from './views/NotFoundView';
import ProofsView from './views/ProofsView';
import VerifyView from './views/VerifyView';
import BountiesView from './views/BountiesView';
import VotesView from './views/VotesView';
import TimeView from './views/TimeView';
import DocsView from './views/DocsView';
import useStore from './state/useStore';
import useRoute from './hooks/useRoute';

function Screen({ segments }: { segments: string[] }) {
  const [first, second] = segments;
  switch (first) {
    case undefined:
      return <MyWorkView />;
    case 'inbox':
      return <InboxView />;
    case 'board':
      return <BoardView />;
    case 'list':
      return <ListView />;
    case 'calendar':
      return <CalendarView />;
    case 'goals':
      return <GoalsView />;
    case 'insights':
      return <InsightsView />;
    case 'settings':
      return <SettingsView />;
    case 'docs':
      return <DocsView />;
    case 'time':
      return <TimeView />;
    case 'votes':
      return <VotesView />;
    case 'bounties':
      return <BountiesView />;
    case 'proofs':
      return <ProofsView />;
    case 'verify':
      return <VerifyView />;
    case 'projects':
      return second ? <ProjectView key={second} projectId={second} /> : <NotFoundView />;
    default:
      return <NotFoundView />;
  }
}

export default function App() {
  const phase = useStore((s) => s.phase);
  const quickAdd = useStore((s) => s.quickAdd.open);
  const palette = useStore((s) => s.palette);
  const shortcuts = useStore((s) => s.shortcuts);
  const extract = useStore((s) => s.extract);
  const { segments, query } = useRoute();
  const [newProject, setNewProject] = useState(false);
  const taskNumber = Number(query.get('task'));

  if (phase === 'loading') {
    return (
      <div className="loading-screen">
        <BrandArt kind="mark" height={40} />
        <Spinner size={18} />
      </div>
    );
  }

  if (phase === 'auth') {
    return (
      <>
        {segments[0] === 'verify' ? <VerifyView standalone /> : <AuthView />}
        <Toasts />
      </>
    );
  }

  return (
    <div className="app">
      <AppEffects />
      <Sidebar onNewProject={() => setNewProject(true)} />
      <Screen segments={segments} />
      {taskNumber > 0 && <TaskDrawer key={taskNumber} number={taskNumber} />}
      {quickAdd && <QuickAdd />}
      {palette && <CommandPalette />}
      {shortcuts && <ShortcutsHelp />}
      {extract && <ExtractModal />}
      {newProject && <ProjectModal onClose={() => setNewProject(false)} />}
      <Toasts />
    </div>
  );
}
