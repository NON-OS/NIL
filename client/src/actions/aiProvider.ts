import http from '../api/http';
import type AiProviderInput from '../types/AiProviderInput';
import type AiProviderSettings from '../types/AiProviderSettings';
import type AiProviderTest from '../types/AiProviderTest';

// Settings → Connect AI, admins only.
const aiProvider = {
  get: () => http.get<AiProviderSettings>('/ai-provider'),
  save: (input: AiProviderInput) => http.put<AiProviderSettings>('/ai-provider', input),
  remove: () => http.del<AiProviderSettings>('/ai-provider'),
  test: (input: AiProviderInput) => http.post<AiProviderTest>('/ai-provider/test', input),
};

export default aiProvider;
