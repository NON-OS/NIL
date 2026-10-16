import toast from '../state/toast';

// Copies to the clipboard and says whether it worked; some browsers refuse without a click.
export default async function copyText(text: string, done = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text);
    toast.show(done, { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Select the text and copy it.', { tone: 'error' });
  }
}
