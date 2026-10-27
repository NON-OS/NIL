import http from '../../api/http';
import type CallView from '../../types/CallView';
import type CallSettings from '../../types/CallSettings';

export interface IceGrant {
  iceServers: RTCIceServer[];
  policy: RTCIceTransportPolicy;
  expiresAt: number | null;
  ttlSeconds: number;
}

const callApi = {
  settings: () => http.get<CallSettings>('/calls/settings'),
  setDirect: (direct: boolean) => http.put<CallSettings>('/calls/settings', { direct }),
  list: () => http.get<{ calls: CallView[] }>('/calls').then((r) => r.calls),
  start: (body: { with?: string[]; projectId?: string }) => http.post<{ call: CallView }>('/calls', body).then((r) => r.call),
  invite: (callId: string, userIds: string[]) => http.post<{ rung: string[]; call: CallView }>(`/calls/${callId}/invite`, { userIds }),
  ice: (callId: string) => http.post<IceGrant>(`/calls/${callId}/turn`),
};

export default callApi;
