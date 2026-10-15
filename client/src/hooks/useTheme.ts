import { useEffect, useState } from 'react';
import storage from '../lib/storage';

type Theme = 'system' | 'light' | 'dark';

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

apply(storage.get<Theme>('theme', 'system'));

export default function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storage.get<Theme>('theme', 'system'));
  useEffect(() => {
    apply(theme);
    storage.set('theme', theme);
  }, [theme]);
  return [theme, setTheme] as const;
}
