import http from '../api/http';
import store from '../state/store';
import aiMode from './aiMode';
import anonymousAi from './anonymousAi';

// One built-in AI request, anonymous or signed in as aiMode says. Either way only `body` goes.
export default function askAi<T>(feature: string, body: object): Promise<T> {
  return aiMode(store.get()).anonymous ? anonymousAi.send<T>(feature, body) : http.post<T>(`/ai/${feature}`, body);
}
