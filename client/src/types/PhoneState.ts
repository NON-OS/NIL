// Where connecting a phone wallet has got to, for the panel that shows the code.
export default interface PhoneState {
  status: 'idle' | 'starting' | 'waiting' | 'expired' | 'connected' | 'failed';
  // the wc: link the code holds, while it waits for the phone
  uri: string | null;
  // when that code stops working, in milliseconds since the epoch
  until: number | null;
  wallet: { name: string; address: string; chainId: number } | null;
  // the person saw the wallet's name and address and chose to go on with it
  confirmed: boolean;
  message: string | null;
  // something in the app needs a wallet, and the phone is on offer
  asking: boolean;
}
