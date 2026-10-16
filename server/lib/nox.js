import config from '../config.js';
import formatUnits from './formatUnits.js';

// "1,000 NOX", for messages people read.
export default function nox(wei) {
  return `${formatUnits(wei, config.nox.decimals)} ${config.nox.symbol}`;
}
