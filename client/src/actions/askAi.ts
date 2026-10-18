import http from '../api/http';
import store from '../state/store';
import aiMode from './aiMode';
import anonymousAi from './anonymousAi';

// One built-in AI request, anonymous when this browser can prove membership right now, signed in
// otherwise. Either way only `body` goes. A reason kept from an earlier request is looked at
// again each time, so a key accepted since then goes back to anonymous.
export default async function askAi<T>(feature: string, body: object): Promise<T> {
  if (aiMode({ ...store.get(), aiSignedReason: null }).anonymous) {
    const id = await anonymousAi.identity();
    if (id) return anonymousAi.send<T>(feature, body, id);
  }
  return http.post<T>(`/ai/${feature}`, body);
}
