import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { GlassLighting } from './GlassLighting';

interface GlassModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export function GlassModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidthClass = 'max-w-2xl',
}: GlassModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-glass-surface="modal"
        className={`relative w-full ${maxWidthClass} max-h-[88vh] flex flex-col rounded-2xl singularity-glass bg-[#060A14]/38 backdrop-blur-md border-[#56D9FF]/35 shadow-[0_20px_70px_rgba(0,0,0,0.55)] overflow-hidden`}
      >
        <GlassLighting showEdgeParticles accent="cyan" />
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold tracking-wide text-[#FFF0D5]">{title}</h2>
            {subtitle && <p className="text-xs text-[#FFF0D5]/60 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#FFF0D5]/70 hover:text-[#56D9FF] hover:bg-[#56D9FF]/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative z-10 p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
