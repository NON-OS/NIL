import type PoolNote from './PoolNote';

// The team's pool notes, as they are encrypted and stored.
export default interface PoolBook {
  v: 1;
  notes: PoolNote[];
}
