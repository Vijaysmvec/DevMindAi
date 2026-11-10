import { useEffect, useRef } from 'react';
import { CosmicAudioEngine, cosmicAudioEngine } from '../../audio/CosmicAudioEngine';

interface AudioVisualizerProps {
  engine?: CosmicAudioEngine;
  active: boolean;
  className?: string;
}

/**
 * Subtle, non-distracting 5-bar spectral telemetry micro-indicator driven by AnalyserNode.
 * Uses GPU-composited scaleY transforms (zero layout reflow) and idles completely when muted/disabled.
 */
export function AudioVisualizer({
  engine = cosmicAudioEngine,
  active,
  className = '',
}: AudioVisualizerProps) {
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const resetIdle = () => {
      for (let i = 0; i < 5; i += 1) {
        const el = barRefs.current[i];
        if (!el) continue;
        el.style.transform = 'scaleY(0.25)';
        el.style.opacity = '0.32';
      }
    };

    if (!active) {
      resetIdle();
      return;
    }

    let rafId = 0;
    let lastUpdateMs = 0;

    const updateBars = (now: number) => {
      if (now - lastUpdateMs >= 48) {
        lastUpdateMs = now;
        const isAudible = engine.isAudible();
        if (!isAudible) {
          resetIdle();
        } else {
          const bars = engine.readVisualizerBars();
          for (let i = 0; i < 5; i += 1) {
            const el = barRefs.current[i];
            if (!el) continue;
            const energy = bars[i] ?? 0;
            const scaleY = 0.28 + Math.min(1, energy) * 0.72;
            el.style.transform = `scaleY(${scaleY.toFixed(2)})`;
            el.style.opacity = (0.58 + Math.min(0.42, energy * 0.55)).toFixed(2);
          }
        }
      }

      rafId = window.requestAnimationFrame(updateBars);
    };

    rafId = window.requestAnimationFrame(updateBars);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [active, engine]);

  return (
    <span
      data-testid="cosmic-audio-visualizer"
      aria-hidden="true"
      className={`inline-flex items-center gap-[2.5px] h-3.5 px-1 ${className}`.trim()}
    >
      {[0, 1, 2, 3, 4].map((idx) => (
        <span
          key={idx}
          ref={(el) => {
            barRefs.current[idx] = el;
          }}
          className={`w-[2px] h-3 rounded-full origin-center will-change-transform ${
            active
              ? idx % 2 === 0
                ? 'bg-[#56D9FF]'
                : 'bg-[#FFB347]'
              : 'bg-[#FFF0D5]/40'
          }`}
          style={{ transform: 'scaleY(0.25)', opacity: 0.32 }}
        />
      ))}
    </span>
  );
}
