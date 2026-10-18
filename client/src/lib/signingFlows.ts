// What each wallet signature is for, wherever Nil asks for several in a row, so people know why
// their wallet keeps asking. The order matches the order the signatures are asked for.
const lock = { title: 'Lock your keys to this wallet', detail: 'This signature becomes the lock on your keys, so only this wallet can open them.' };
const again = { title: 'Sign the same message again', detail: 'Nil checks your wallet signs it the same way every time. If it didn’t, it could never open your keys again.' };

const signingFlows = {
  keys: {
    title: 'Setting up your encryption keys',
    steps: [
      { ...lock, detail: 'Your browser just made your keys. This signature becomes their lock, so only this wallet can open them.' },
      again,
      { title: 'Publish your public keys', detail: 'Teammates’ browsers check this signature, so they know the keys are really yours.' },
    ],
  },
  addWallet: {
    title: 'Letting this wallet open your keys',
    steps: [lock, again],
  },
  link: {
    title: 'Linking your backup wallet',
    steps: [{ title: 'Sign in with the backup', detail: 'Shows the backup wallet is yours and lets it sign you in from now on.' }, { ...lock, title: 'Lock your keys to the backup' }, again],
  },
};

export type SigningFlow = keyof typeof signingFlows;

export default signingFlows;
