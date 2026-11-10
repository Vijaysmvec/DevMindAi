import { useSingularityStore } from '../../src/store/singularityStore';

interface GlassLightingProps {
  showEdgeParticles?: boolean;
  accent?: 'cyan' | 'gold' | 'violet';
}

/**
 * Part B.4 & D.8: Crystal-Clear Dynamic Glass Lighting & Shockwave Edge Illumination
 * Renders behind actual panel content (z-0, pointer-events-none) so UI text & controls
 * stay 100% crisp and readable.
 */
export function GlassLighting({ showEdgeParticles = false, accent = 'cyan' }: GlassLightingProps) {
  const prefs = useSingularityStore((s) => s.visualPreferences);
  const showReflections = prefs.dynamic_glass_reflections && prefs.mode !== 'focus';
  const showParticles =
    showEdgeParticles && prefs.mode === 'cinematic' && !prefs.reduced_motion && prefs.particle_density > 0.25;

  const topHighlight =
    accent === 'gold'
      ? 'from-[#FFF0D5]/55 via-[#FFB347]/35 to-transparent'
      : accent === 'violet'
        ? 'from-[#FFF0D5]/50 via-[#8765D8]/35 to-transparent'
        : 'from-[#FFF0D5]/60 via-[#56D9FF]/40 to-[#FFB347]/22';

  return (
    <div aria-hidden="true" className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none z-0">
      {/* Directional black-hole amber + cursor cyan + expanding shockwave surface reflection */}
      {showReflections && <div className="absolute inset-0 singularity-glass-reflection" />}

      {/* Fine top refractive specular glass edge highlight */}
      <div
        className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r ${topHighlight}`}
        style={{ opacity: 'calc(0.85 + var(--shockwave-boost, 0) * 0.45)' }}
      />

      {/* Subtle bottom warm accretion & shockwave reflection */}
      {showReflections && (
        <div
          className="absolute inset-x-4 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-[#FFB347]/30 to-transparent"
          style={{ opacity: 'calc(0.65 + var(--shockwave-boost, 0) * 0.6)' }}
        />
      )}

      {/* Ultra-fine decorative edge specks restricted strictly to panel perimeter */}
      {showParticles && (
        <>
          <span className="absolute top-1.5 right-3 w-1 h-1 rounded-full bg-[#56D9FF]/60 shadow-[0_0_5px_#56D9FF] animate-pulse" />
          <span
            className="absolute bottom-2 left-4 w-1 h-1 rounded-full bg-[#FFB347]/50 shadow-[0_0_5px_#FFB347] animate-pulse"
            style={{ animationDelay: '1.4s' }}
          />
          <span
            className="absolute top-1/2 right-1 w-0.5 h-0.5 rounded-full bg-[#FFF0D5]/55"
            style={{ animationDelay: '2.3s' }}
          />
        </>
      )}
    </div>
  );
}
