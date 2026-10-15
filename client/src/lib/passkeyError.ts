// Browsers report passkey problems as DOMExceptions with terse names.
export default function passkeyError(err: unknown): Error {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError') return new Error('The passkey request was canceled or timed out.');
  if (name === 'InvalidStateError') return new Error('This device already has a passkey for this account.');
  if (name === 'SecurityError') return new Error('Passkeys need a secure connection (https) or localhost.');
  if (name === 'NotSupportedError') return new Error('This browser or device doesn’t support passkeys.');
  return err instanceof Error ? err : new Error('Passkey sign-in failed.');
}
