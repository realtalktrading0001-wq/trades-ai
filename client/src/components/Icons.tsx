import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const UserIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
);
export const GiftIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M3 12h18M12 8v13M12 8C9 8 7 6.5 7 5s2-2 5 3c3-5 5-3.5 5-2s-2 2-5 2z" /></svg>
);
export const SignalIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M3 17l5-6 4 4 4-7 5 8" /><circle cx="8" cy="11" r="1.4" fill="currentColor" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /><circle cx="16" cy="8" r="1.4" fill="currentColor" /></svg>
);
export const BotIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4M9 13h.01M15 13h.01M9 16h6" /><circle cx="12" cy="3" r="1" fill="currentColor" /></svg>
);
export const SupportIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M9 10h.01M12 10h.01M15 10h.01" /></svg>
);
export const ChartUpIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M3 21h18" /><path d="M4 17l5-5 4 3 7-9" /><path d="M20 6h-4M20 6v4" /></svg>
);
export const ClockIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const LightningIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M13 2 5 13h6l-1 9 9-13h-6z" /></svg>
);
export const MoonIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5z" /></svg>
);
export const SunIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
);
export const BarsIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M3 21h18" /><rect x="5" y="11" width="3.5" height="8" rx="1" /><rect x="10.25" y="6" width="3.5" height="13" rx="1" /><rect x="15.5" y="13" width="3.5" height="6" rx="1" /></svg>
);
export const TrophyIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 12.5V16M14 12.5V16M8 20h8M9 16h6l1 4H8z" /></svg>
);
export const RefreshIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 4v4h-4" /></svg>
);
export const CheckIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>
);
export const LockIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const WarningIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></svg>
);
export const ChevronDown = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const SendIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
);
export const CopyIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
);
export const CloseIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const ArrowUpIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const ArrowDownIcon = (p: P) => (
  <svg viewBox="0 0 24 24" {...base} {...p}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
