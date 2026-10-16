// The server writes the sign-in and ballot messages a wallet signs. A dishonest server could slip
// a key message in their place (every one carries urn:nil: resources) and collect the signature
// that opens someone's identity, so the browser refuses to sign server-written text like that.
export default function assertNotKeyMessage(message: string) {
  if (message.includes('urn:nil:')) {
    throw new Error('The server asked your wallet to sign a key message in place of an ordinary request, so Nil didn’t sign it. Tell your workspace admin.');
  }
}
