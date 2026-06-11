import type { ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  dismissable?: boolean;
}

export default function Modal({ open, onClose, children, dismissable = true }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
      />
      <div className="relative z-10 w-full max-w-md mx-auto animate-fade-in">
        <div className="card m-3 p-6 pb-7">
          {dismissable && onClose && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-muted hover:text-white"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
