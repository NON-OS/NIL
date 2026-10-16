// Production builds only: during development a cached shell would just get in the way.
export default function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    // the worker script always comes from the network, so a fixed one replaces a broken one
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
