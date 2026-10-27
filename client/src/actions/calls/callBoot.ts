import store from '../../state/store';
import callStore from '../../state/callStore';
import callApi from './callApi';
import ringNotice from './ringNotice';

// What calls look like when the app opens or the live connection comes back: whether they
// work here, which calls are going on, and which are ringing this person. Guests have no calls.
export default async function callBoot() {
  if (store.get().guest) return;
  const [settings, calls] = await Promise.all([callApi.settings(), callApi.list()]);
  const me = store.get().me?.id;
  const active = callStore.get().active?.id;
  const ringing = calls.filter((c) => me && c.ringing.includes(me) && c.id !== active).map((c) => c.id);
  ringing.forEach(ringNotice.start);
  callStore.set({ settings, live: Object.fromEntries(calls.map((c) => [c.id, c])), ringing });
}
