import { useRef, useState, type ReactNode } from 'react';
import Popover from './Popover';
import Menu from './Menu';
import type MenuOption from '../../types/MenuOption';

interface Props {
  options: MenuOption[];
  value: string | string[] | null;
  onChange: (value: string) => void;
  children: ReactNode;
  multi?: boolean;
  className?: string;
  title: string;
  placeholder?: string;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  width?: number;
  align?: 'start' | 'end';
  disabled?: boolean;
}

// A button that opens a searchable menu. Multi-select pickers stay open while you toggle.
export default function Picker({ options, value, onChange, children, multi, className = 'prop-btn', title, placeholder, onCreate, createLabel, width = 240, align, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={className}
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {children}
      </button>
      <Popover anchor={anchor} open={open} onClose={close} width={width} align={align}>
        <Menu
          options={options}
          selected={value}
          placeholder={placeholder}
          searchable={options.length > 6 || !!onCreate}
          onCreate={
            onCreate &&
            ((q) => {
              onCreate(q);
              if (!multi) close();
            })
          }
          createLabel={createLabel}
          onSelect={(v) => {
            onChange(v);
            if (!multi) close();
          }}
        />
      </Popover>
    </>
  );
}
