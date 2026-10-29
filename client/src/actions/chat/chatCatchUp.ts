import store from '../../state/store';
import chatState from '../../state/chatState';
import chatChannels from './chatChannels';
import chatTimeline from './chatTimeline';
import chatSend from './chatSend';

let connected = store.get().connected;

// Back on the socket after a break, wherever the app is: the conversation list again, what came
// in each conversation this tab has open, and anything still waiting on this device.
async function catchUp() {
  if (!store.get().docsUnlocked || !chatState.get().loaded) return;
  await chatChannels.load();
  for (const c of Object.values(chatState.get().channels)) if (chatState.get().timelines[c.id]) await chatTimeline.catchUp(c);
  await chatSend.flush();
}

store.subscribe(() => {
  const now = store.get().connected;
  const back = now && !connected;
  connected = now;
  if (back) void catchUp().catch(() => {});
});

export default catchUp;
