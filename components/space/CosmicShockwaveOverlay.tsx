import { useEffect, useRef } from 'react';
import { cosmicEngine } from '../../src/engine/cosmicEngine';

/**
 * Part B.4 (PRIORITY FEATURE): Full-Screen Cosmic Shockwave
 * Renders trajectory-triggered astronomical energy waves expanding outward from the
 * central black hole across 100% of the viewport behind crystal-clear glass panels.
 * Uses idle-frame dirty skipping (0ms CPU & 0 compositor uploads when no shockwave is active).
 */
export function CosmicShockwaveOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let canvasDirty = true;

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, Math.floor(window.innerWidth));
      canvas.height = Math.max(1, Math.floor(window.innerHeight));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      canvasDirty = true;
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;

    const renderWaves = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (ctx && !cosmicEngine.isPageHidden) {
        const waves = cosmicEngine.activeShockwaves;
        const hasActiveWaves = waves.length > 0 && !cosmicEngine.preferences.reduced_motion;

        if (!hasActiveWaves) {
          if (canvasDirty) {
            ctx.clearRect(0, 0, canvas!.width, canvas!.height);
            canvasDirty = false;
          }
        } else {
          const vw = canvas!.width;
          const vh = canvas!.height;
          ctx.clearRect(0, 0, vw, vh);
          canvasDirty = true;

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';

          for (let wIdx = 0; wIdx < waves.length; wIdx++) {
            const sw = waves[wIdx];
            const p = sw.progress;
            const eased = 1.0 - Math.pow(1.0 - p, 2.05);
            const radius = Math.max(18, eased * sw.maxViewportRadius);
            const decay = Math.pow(1.0 - p, 1.55) * Math.min(1.0, p * 9.0) * sw.intensity;

            if (decay <= 0.005) continue;

            const ox = sw.originX;
            const oy = sw.originY;

            if (p < 0.28) {
              const coreEnv = (1.0 - p / 0.28) * sw.intensity;
              const coreRadius = 34 + p * 185;
              const coreGrad = ctx.createRadialGradient(ox, oy, 14, ox, oy, coreRadius);
              coreGrad.addColorStop(0, 'rgba(255, 240, 213, 0)');
              coreGrad.addColorStop(0.28, `rgba(255, 240, 213, ${(coreEnv * 0.62).toFixed(3)})`);
              coreGrad.addColorStop(0.62, `rgba(255, 179, 71, ${(coreEnv * 0.38).toFixed(3)})`);
              coreGrad.addColorStop(1, 'rgba(232, 135, 50, 0)');
              ctx.fillStyle = coreGrad;
              ctx.beginPath();
              ctx.arc(ox, oy, coreRadius, 0, Math.PI * 2);
              ctx.fill();
            }

            const bandThickness = Math.max(36, 95 * (1.0 - p * 0.35));
            const innerR = Math.max(1, radius - bandThickness);
            const outerR = radius + bandThickness * 0.38;

            const waveGrad = ctx.createRadialGradient(ox, oy, innerR, ox, oy, outerR);
            waveGrad.addColorStop(0, 'rgba(232, 135, 50, 0)');
            waveGrad.addColorStop(0.45, `rgba(232, 135, 50, ${(decay * 0.16).toFixed(3)})`);
            waveGrad.addColorStop(0.76, `rgba(255, 179, 71, ${(decay * 0.30).toFixed(3)})`);
            waveGrad.addColorStop(0.90, `rgba(255, 240, 213, ${(decay * 0.36).toFixed(3)})`);
            waveGrad.addColorStop(0.96, `rgba(86, 217, 255, ${(decay * 0.34).toFixed(3)})`);
            waveGrad.addColorStop(1, 'rgba(86, 217, 255, 0)');

            ctx.fillStyle = waveGrad;
            ctx.beginPath();
            ctx.arc(ox, oy, outerR, 0, Math.PI * 2);
            ctx.arc(ox, oy, innerR, 0, Math.PI * 2, true);
            ctx.fill();

            ctx.strokeStyle = `rgba(86, 217, 255, ${(decay * 0.56).toFixed(3)})`;
            ctx.lineWidth = 1.35;
            ctx.beginPath();
            ctx.arc(ox, oy, radius, 0, Math.PI * 2);
            ctx.stroke();

            if (radius > 70) {
              ctx.strokeStyle = `rgba(255, 179, 71, ${(decay * 0.32).toFixed(3)})`;
              ctx.lineWidth = 1.0;
              ctx.beginPath();
              ctx.arc(ox, oy, radius * 0.79, 0, Math.PI * 2);
              ctx.stroke();
            }

            const rayCount = 20;
            const baseSeed = sw.id * 1.618;
            ctx.strokeStyle = `rgba(255, 240, 213, ${(decay * 0.50).toFixed(3)})`;
            ctx.lineWidth = 0.95;
            ctx.beginPath();
            for (let k = 0; k < rayCount; k++) {
              const angle = (k / rayCount) * Math.PI * 2 + baseSeed + p * 0.28;
              const jitter = 0.92 + 0.14 * Math.sin(k * 7.3 + sw.id);
              const tipR = radius * jitter;
              const tailLen = 12 + 26 * (1 - p);
              const tailR = Math.max(16, tipR - tailLen);
              ctx.moveTo(ox + Math.cos(angle) * tailR, oy + Math.sin(angle) * tailR);
              ctx.lineTo(ox + Math.cos(angle) * tipR, oy + Math.sin(angle) * tipR);
            }
            ctx.stroke();
          }

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(renderWaves);
    };

    rafId = window.requestAnimationFrame(renderWaves);
    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="cosmic-shockwave-canvas"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none"
      style={{ zIndex: 3 }}
    />
  );
}
