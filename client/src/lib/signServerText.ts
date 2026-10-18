import ethereum from './ethereum';
import assertNotKeyMessage from './crypto/assertNotKeyMessage';

// The only way text the server wrote gets signed: sign-in challenges, ballots and bounty
// applications. Anything that could be a key message is refused first. Key messages are built in
// this browser and signed with ethereum.sign directly.
export default async function signServerText(message: unknown, address: string) {
  if (typeof message !== 'string') throw new Error('The server sent something to sign that isn’t text, so Nil didn’t sign it. Tell your workspace admin.');
  assertNotKeyMessage(message);
  return ethereum.sign(message, address);
}
