import { useMemo } from 'react';
import useStore from '../state/useStore';

export default function useTasks() {
  const map = useStore((s) => s.tasks);
  return useMemo(() => Object.values(map), [map]);
}
