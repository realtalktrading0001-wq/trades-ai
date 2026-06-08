import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, LockIcon } from './Icons';

interface DropdownProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  prefix?: ReactNode;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
}

export default function Dropdown({ label, value, options, onChange, prefix, buttonClassName = '', menuClassName = '', disabled = false }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close the menu if the dropdown becomes disabled (e.g. signal generating).
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={ref} className="relative">
      {label && <div className="label-muted mb-1.5">{label}</div>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-105'} ${buttonClassName}`}
        style={{ background: 'var(--pill-bg)', borderColor: 'var(--card-border)', color: 'var(--app-strong)' }}
      >
        <span className="flex min-w-0 items-center gap-2.5 font-semibold">
          {prefix}
          <span className="truncate">{value}</span>
        </span>
        {disabled ? (
          <LockIcon className="h-4 w-4 text-muted" />
        ) : (
          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-2 w-full max-h-72 overflow-auto rounded-xl border shadow-xl animate-fade-in ${menuClassName}`}
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', backdropFilter: 'blur(12px)' }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 ${
                opt === value ? 'text-cyan font-semibold' : 'text-slate-200'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
