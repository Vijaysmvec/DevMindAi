import React from 'react';
import { GlassLighting } from './GlassLighting';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  accent?: 'cyan' | 'gold' | 'violet';
  edgeParticles?: boolean;
  children: React.ReactNode;
}

export function GlassCard({
  interactive = true,
  accent = 'cyan',
  edgeParticles = false,
  className = '',
  children,
  ...rest
}: GlassCardProps) {
  return (
    <div
      data-glass-surface="card"
      className={`relative rounded-xl singularity-glass-card ${
        interactive ? 'singularity-glass-interactive' : ''
      } p-4 ${className}`}
      {...rest}
    >
      <GlassLighting showEdgeParticles={edgeParticles} accent={accent} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
