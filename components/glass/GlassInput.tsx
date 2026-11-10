import React, { forwardRef } from 'react';
import { GlassLighting } from './GlassLighting';

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  enableGravityDeletion?: boolean;
  containerClassName?: string;
}

export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(function GlassTextarea(
  { enableGravityDeletion = false, containerClassName = '', className = '', ...props },
  ref
) {
  return (
    <div
      data-glass-surface="input-container"
      className={`relative rounded-xl singularity-glass-input focus-within:border-[#56D9FF]/65 focus-within:shadow-[0_0_24px_rgba(86,217,255,0.20)] ${containerClassName}`}
    >
      <GlassLighting accent="cyan" />
      <textarea
        ref={ref}
        data-gravity-input={enableGravityDeletion ? 'true' : undefined}
        className={`relative z-10 w-full bg-transparent text-[#FFF0D5] placeholder-[#FFF0D5]/40 px-4 py-3 text-sm leading-relaxed focus:outline-none resize-none ${className}`}
        {...props}
      />
    </div>
  );
});

interface GlassInputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  enableGravityDeletion?: boolean;
  containerClassName?: string;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputFieldProps>(function GlassInput(
  { enableGravityDeletion = false, containerClassName = '', className = '', ...props },
  ref
) {
  return (
    <div
      data-glass-surface="input-container"
      className={`relative rounded-xl singularity-glass-input focus-within:border-[#56D9FF]/65 focus-within:shadow-[0_0_20px_rgba(86,217,255,0.18)] ${containerClassName}`}
    >
      <GlassLighting accent="cyan" />
      <input
        ref={ref}
        data-gravity-input={enableGravityDeletion ? 'true' : undefined}
        className={`relative z-10 w-full bg-transparent text-[#FFF0D5] placeholder-[#FFF0D5]/40 px-3.5 py-2.5 text-sm focus:outline-none ${className}`}
        {...props}
      />
    </div>
  );
});
