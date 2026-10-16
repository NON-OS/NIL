import store from '../state/store';
import buildId from '../lib/buildId';

// Notes when the server hands out a newer web app than the one this tab runs, so the tab can
// offer a reload before a lazy screen asks for a file the deploy removed.
export default function checkBuild(serverBuild: string | null | undefined) {
  if (buildId && serverBuild && serverBuild !== buildId && !store.get().updateReady) store.set({ updateReady: true });
}
