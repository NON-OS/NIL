import toast from '../../state/toast';

// Starts a call from anywhere in the app, loading the call code only when it's first needed.
export default async function startCall(target: { with: string[] } | { projectId: string }, { video = false } = {}) {
  try {
    const session = (await import('./callSession')).default;
    await session.start(target, { video });
  } catch (err) {
    toast.error(err);
  }
}
