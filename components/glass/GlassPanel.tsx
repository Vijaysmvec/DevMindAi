import React from 'react';
import { GlassLighting } from './GlassLighting';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'elevated' | 'over-bright';
  accent?: 'cyan' | 'gold' | 'violet';
  edgeParticles?: boolean;
  contentClassName?: string;
  children: React.ReactNode;
}

export function GlassPanel({
  tone = 'default',
  accent = 'cyan',
  edgeParticles = false,
  className = '',
  contentClassName = '',
  style,
  children,
  ...rest
}: GlassPanelProps) {
  const extraTone =
    tone === 'over-bright'
      ? 'bg-white/[0.025]'
      : tone === 'elevated'
        ? 'bg-white/[0.018]'
        : '';

  const isFlex = className.includes('flex');
  const isFlexCol = className.includes('flex-col');
  const innerFlex = isFlexCol
    ? 'flex flex-col flex-1 min-h-0'
    : isFlex
      ? 'flex flex-1 min-h-0'
      : '';

  return (
    <div
      data-glass-surface="panel"
      className={`relative rounded-2xl singularity-glass ${extraTone} ${className}`}
      style={style}
      {...rest}
    >
      <GlassLighting showEdgeParticles={edgeParticles} accent={accent} />
      <div className={`relative z-10 w-full h-full min-h-0 ${innerFlex} ${contentClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}
