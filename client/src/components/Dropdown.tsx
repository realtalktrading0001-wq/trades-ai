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
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    // pointerdown covers mouse + touch uniformly (reliable inside Telegram).
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, []);

  // Close the menu if the dropdown becomes disabled (e.g. signal generating).
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Clear the search box whenever the menu closes.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Show a search box for long lists (timezones, currency pairs) so users can
  // jump straight to what they want instead of scrolling.
  const searchable = options.length > 8;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  function choose(opt: string) {
    onChange(opt);
    setOpen(false);
  }

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
          {searchable && (
            <div className="sticky top-0 z-10 p-2" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--card-border)' }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered.length) {
                    e.preventDefault();
                    choose(filtered[0]);
                  }
                }}
                placeholder="Search…"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted"
                style={{ background: 'var(--pill-bg)', border: '1px solid var(--card-border)', color: 'var(--app-strong)' }}
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">No matches</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                onClick={() => choose(opt)}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 ${
                  opt === value ? 'text-cyan font-semibold' : 'text-slate-200'
                }`}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
