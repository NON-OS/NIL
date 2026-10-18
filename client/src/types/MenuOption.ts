import type { ReactNode } from 'react';

export default interface MenuOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  // a sentence under the label, for options whose meaning a short hint can't carry
  detail?: string;
  keywords?: string;
}
