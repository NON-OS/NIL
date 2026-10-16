// The host of a URL someone is typing, or null while it isn't a URL yet.
export default function urlHost(text: string): string | null {
  try {
    return new URL(text).host;
  } catch {
    return null;
  }
}
