import useStore from '../state/useStore';

// Who built-in AI sends text to, by name, for the sentences that say where a request goes.
export default function useAiProviderName() {
  return useStore((s) => s.aiProvider?.name ?? 'the AI provider');
}
