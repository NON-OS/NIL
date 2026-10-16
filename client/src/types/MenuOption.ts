import type { ReactNode } from 'react';

export default interface MenuOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  keywords?: string;
}
