import store from '../state/store';

// The Files limits this server sent with the bootstrap. Files only opens once that's in, so a
// missing one means the page is from before the server was upgraded.
export default function filesLimits() {
  const limits = store.get().files;
  if (!limits) throw new Error('Reload the page to use Files.');
  return limits;
}
