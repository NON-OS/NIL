// Every leaf of a pool's state tree and of its association set, with the roots on-chain.
export default interface PoolSets {
  aspLeaves: string[];
  aspRoot: string;
  stateLeaves: string[];
  stateRoot: string;
}
