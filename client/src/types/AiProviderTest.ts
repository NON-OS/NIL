// How one test request to an AI provider went.
type AiProviderTest = { ok: true; reply: string; ms: number } | { ok: false; error: string };
export default AiProviderTest;
