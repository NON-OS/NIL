import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import selector from '../chain/selector.js';

const topic = (signature) => `0x${bytesToHex(keccak_256(utf8ToBytes(signature)))}`;

// The parts of the Privacy Pools contracts (0xbow, privacy-pools-core) Nil reads: event topics
// and the 4-byte selectors of the views it calls.
const poolAbi = Object.freeze({
  deposited: topic('Deposited(address,uint256,uint256,uint256,uint256)'),
  withdrawn: topic('Withdrawn(address,uint256,uint256,uint256)'),
  ragequit: topic('Ragequit(address,uint256,uint256,uint256)'),
  relayed: topic('WithdrawalRelayed(address,address,address,uint256,uint256)'),
  leafInserted: topic('LeafInserted(uint256,uint256,uint256)'),
  assetConfig: selector('assetConfig(address)'),
  latestRoot: selector('latestRoot()'),
  scope: selector('SCOPE()'),
  asset: selector('ASSET()'),
  entrypoint: selector('ENTRYPOINT()'),
  currentRoot: selector('currentRoot()'),
  currentTreeSize: selector('currentTreeSize()'),
  dead: selector('dead()'),
});

export default poolAbi;
