import store from '../state/store';
import formatUnits from './formatUnits';

// "250 NOX", using the token details the server announced.
export default function noxAmount(wei: string | bigint) {
  const nox = store.get().nox;
  return `${formatUnits(wei, nox?.decimals ?? 18)} ${nox?.symbol ?? 'NOX'}`;
}
