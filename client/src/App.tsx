import { lazy, Suspense, useState } from 'react';
import Sidebar from './components/shell/Sidebar';
import AppEffects from './components/shell/AppEffects';
import UpdatePrompt from './components/shell/UpdatePrompt';
import TaskDrawer from './components/drawer/TaskDrawer';
import QuickAdd from './components/overlays/QuickAdd';
import CommandPalette from './components/overlays/CommandPalette';
import ProjectModal from './components/overlays/ProjectModal';
import Toasts from './components/ui/Toasts';
import KeyCheckModal from './components/keys/KeyCheckModal';
import SigningGuide from './components/keys/SigningGuide';
import PhoneWalletHost from './components/phone/PhoneWalletHost';
import BrandArt from './components/brand/BrandArt';
import Spinner from './components/ui/Spinner';
import MyWorkView from './views/MyWorkView';
import InboxView from './views/InboxView';
import BoardView from './views/BoardView';
import ListView from './views/ListView';
import ProjectView from './views/ProjectView';
import NotFoundView from './views/NotFoundView';
import OfflineView from './views/OfflineView';
import OfflineBanner from './components/shell/OfflineBanner';
import useStore from './state/useStore';
import useRoute from './hooks/useRoute';
import useCryptoTools from './hooks/useCryptoTools';
import cryptoOnly from './lib/cryptoOnly';
import BackupWalletNudge from './components/shell/BackupWalletNudge';
import SkipLink from './components/shell/SkipLink';
import MainContent from './components/shell/MainContent';

// The everyday screens above load with the app. The rest arrive when first opened, so the
// first paint of My work and the board doesn't wait on settings, charts, crypto or exports.
const AuthView = lazy(() => import('./views/AuthView'));
const CalendarView = lazy(() => import('./views/CalendarView'));
const GoalsView = lazy(() => import('./views/GoalsView'));
const InsightsView = lazy(() => import('./views/InsightsView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const DocsView = lazy(() => import('./views/DocsView'));
const TimeView = lazy(() => import('./views/TimeView'));
const VotesView = lazy(() => import('./views/VotesView'));
const BountiesView = lazy(() => import('./views/BountiesView'));
const ProofsView = lazy(() => import('./views/ProofsView'));
const VerifyView = lazy(() => import('./views/VerifyView'));
const SharePage = lazy(() => import('./views/SharePage'));
const OpenBountiesPage = lazy(() => import('./views/OpenBountiesPage'));
const PublicVotePage = lazy(() => import('./views/PublicVotePage'));
const ShortcutsHelp = lazy(() => import('./components/overlays/ShortcutsHelp'));
const ExtractModal = lazy(() => import('./components/overlays/ExtractModal'));
const DeckModal = lazy(() => import('./components/decks/DeckModal'));
// the help center carries every docs page as text
const HelpView = lazy(() => import('./views/HelpView'));

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <BrandArt kind="mark" height={40} />
      <Spinner size={18} />
    </div>
  );
}

function ViewLoading() {
  return (
    <div className="main view-loading">
      <Spinner size={18} />
    </div>
  );
}

function Screen({ segments }: { segments: string[] }) {
  const [first, second] = segments;
  const cryptoTools = useCryptoTools();
  if (!cryptoTools && cryptoOnly(`/${first}`)) return <NotFoundView />;
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
    case 'help':
      return <HelpView />;
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
  const deckOpen = useStore((s) => s.deck.open);
  const keyCheck = useStore((s) => s.keyCheck !== null);
  const { segments, query } = useRoute();
  const [newProject, setNewProject] = useState(false);
  const taskNumber = Number(query.get('task'));

  // public pages work signed in or out, outside the app shell
  if (segments[0] === 's' && segments[1]) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <SharePage token={segments[1]} />
      </Suspense>
    );
  }
  if (segments[0] === 'vote' && segments[1]) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <PublicVotePage slug={segments[1]} />
        </Suspense>
        <PhoneWalletHost />
      </>
    );
  }
  if (segments[0] === 'open') {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <OpenBountiesPage />
        </Suspense>
        <PhoneWalletHost />
      </>
    );
  }

  if (phase === 'loading') return <LoadingScreen />;
  if (phase === 'offline') return <OfflineView />;

  // a sign-in reset link signs in as the person it was made for, even over another session
  if (phase === 'auth' || (segments[0] === 'reset' && segments[1])) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          {segments[0] === 'verify' ? <VerifyView standalone /> : segments[0] === 'help' ? <HelpView standalone /> : <AuthView />}
        </Suspense>
        <PhoneWalletHost />
        <Toasts />
      </>
    );
  }

  return (
    <div className="app">
      <SkipLink />
      <AppEffects />
      <Sidebar onNewProject={() => setNewProject(true)} />
      <MainContent>
        <OfflineBanner />
        <Suspense fallback={<ViewLoading />}>
          <Screen segments={segments} />
        </Suspense>
      </MainContent>
      {taskNumber > 0 && <TaskDrawer key={taskNumber} number={taskNumber} />}
      {quickAdd && <QuickAdd />}
      {palette && <CommandPalette />}
      {newProject && <ProjectModal onClose={() => setNewProject(false)} />}
      <Suspense fallback={null}>
        {shortcuts && <ShortcutsHelp />}
        {extract && <ExtractModal />}
        {deckOpen && <DeckModal />}
      </Suspense>
      <UpdatePrompt />
      {keyCheck && <KeyCheckModal />}
      <SigningGuide />
      <PhoneWalletHost />
      <BackupWalletNudge />
      <Toasts />
    </div>
  );
}
