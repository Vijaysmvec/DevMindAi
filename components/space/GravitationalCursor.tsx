import { useEffect, useRef } from 'react';
import { cosmicEngine, PARTICLE_SYSTEM_PARAMS } from '../../src/engine/cosmicEngine';
import { useSingularityStore } from '../../src/store/singularityStore';

const CFG = PARTICLE_SYSTEM_PARAMS.gravitationalInteraction;

interface CursorGrain {
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  offsetX: number;
  offsetY: number;
  size: number;
  colorIdx: number;
}

/**
 * Part A.2 System #5 & Part D.7: Gravitational Cursor & Interaction Particles
 * Optimized with 1x DPR and color-bucketed single-path batching (4 draw calls total instead of 168).
 */
export function GravitationalCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);

  useEffect(() => {
    let lastStateBump = 0;

    const handlePointerMove = (e: PointerEvent) => {
      cosmicEngine.updatePointer(e.clientX, e.clientY);
      const now = performance.now();
      if (
        now - lastStateBump > 360 &&
        cosmicEngine.state === 'IDLE' &&
        cosmicEngine.preferences.gravitational_cursor_strength > 0 &&
        !cosmicEngine.preferences.reduced_motion
      ) {
        lastStateBump = now;
        setInteractionState('CURSOR_ACTIVE', 950);
      }
    };

    const handleTouch = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        cosmicEngine.updatePointer(t.clientX, t.clientY);
        if (cosmicEngine.state === 'IDLE' && !cosmicEngine.preferences.reduced_motion) {
          setInteractionState('CURSOR_ACTIVE', 900);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('touchmove', handleTouch, { passive: true });

    const palette = ['#FFF0D5', '#FFB347', '#E88732', '#56D9FF'];
    const grains: CursorGrain[] = Array.from({ length: CFG.maxCount }, (_, idx) => ({
      baseX: Math.random() * window.innerWidth,
      baseY: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.5) * 14,
      offsetX: 0,
      offsetY: 0,
      size: 1.1 + (idx % 3) * 0.35,
      colorIdx: idx % palette.length,
    }));

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
    let lastNow = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && !cosmicEngine.isPageHidden) {
        const prefs = cosmicEngine.preferences;
        const isReduced = prefs.reduced_motion || !prefs.background_animation;
        const influenceRadius =
          CFG.radiusPx * Math.max(0.45, Math.min(1.6, prefs.gravitational_cursor_strength));
        cosmicEngine.cursorRadiusPx = influenceRadius;

        if (isReduced) {
          if (canvasDirty) {
            ctx.clearRect(0, 0, canvas!.width, canvas!.height);
            canvasDirty = false;
          }
        } else {
          const vw = canvas!.width;
          const vh = canvas!.height;
          ctx.clearRect(0, 0, vw, vh);
          canvasDirty = true;

          const cursorInf = cosmicEngine.cursorInfluence;
          const cx = cosmicEngine.smoothCursorX;
          const cy = cosmicEngine.smoothCursorY;

          if (cursorInf > 0.025) {
            const haloAlpha = Math.min(0.42, cursorInf * 0.26);
            const lensRadius = 26 + Math.min(14, cosmicEngine.cursorVelocity * 0.18);

            const haloGrad = ctx.createRadialGradient(
              cx,
              cy,
              lensRadius * 0.35,
              cx,
              cy,
              lensRadius * 2.1
            );
            haloGrad.addColorStop(0, 'rgba(86, 217, 255, 0)');
            haloGrad.addColorStop(0.46, `rgba(86, 217, 255, ${(haloAlpha * 0.55).toFixed(3)})`);
            haloGrad.addColorStop(0.66, `rgba(255, 179, 71, ${(haloAlpha * 0.32).toFixed(3)})`);
            haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, lensRadius * 2.1, 0, Math.PI * 2);
            ctx.fill();

            const spin = cosmicEngine.elapsedTime * 1.35;
            ctx.strokeStyle = `rgba(255, 240, 213, ${(haloAlpha * 0.65).toFixed(3)})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.arc(cx, cy, lensRadius, spin, spin + Math.PI * 0.58);
            ctx.stroke();

            ctx.strokeStyle = `rgba(86, 217, 255, ${(haloAlpha * 0.62).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(cx, cy, lensRadius * 1.08, spin + Math.PI, spin + Math.PI * 1.58);
            ctx.stroke();
          }

          const activeGrains = Math.max(
            18,
            Math.min(CFG.maxCount, Math.floor(CFG.maxCount * cosmicEngine.getEffectiveParticleScale()))
          );
          const relax = 1.0 - Math.exp(-5.4 * dt);
          const invRadius = 1.0 / Math.max(1, influenceRadius);
          const radiusSq = influenceRadius * influenceRadius;

          // Update physics once, then batch render by palette color (4 draw calls total!)
          for (let cIdx = 0; cIdx < palette.length; cIdx++) {
            ctx.fillStyle = palette[cIdx];
            ctx.globalAlpha = 0.46;
            ctx.beginPath();

            for (let i = cIdx; i < activeGrains; i += palette.length) {
              const g = grains[i];
              g.baseX += g.vx * dt;
              g.baseY += g.vy * dt;
              if (g.baseX < 0) g.baseX += vw;
              else if (g.baseX > vw) g.baseX -= vw;
              if (g.baseY < 0) g.baseY += vh;
              else if (g.baseY > vh) g.baseY -= vh;

              let targetOffX = 0;
              let targetOffY = 0;
              if (cursorInf > 0.01) {
                const dx = cx - g.baseX;
                const dy = cy - g.baseY;
                const distSq = dx * dx + dy * dy;
                if (distSq > 4 && distSq < radiusSq) {
                  const dist = Math.sqrt(distSq);
                  const oneMinus = 1.0 - dist * invRadius;
                  const localPull = oneMinus * oneMinus * cursorInf;
                  const invDist = 1.0 / dist;
                  const nx = dx * invDist;
                  const ny = dy * invDist;
                  targetOffX = (nx * 30 - ny * 24) * localPull;
                  targetOffY = (ny * 30 + nx * 24) * localPull;
                }
              }

              g.offsetX += (targetOffX - g.offsetX) * relax;
              g.offsetY += (targetOffY - g.offsetY) * relax;

              const curX = g.baseX + g.offsetX;
              const curY = g.baseY + g.offsetY;
              ctx.rect(curX, curY, g.size, g.size);
            }

            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('touchmove', handleTouch);
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
    };
  }, [setInteractionState]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="gravitational-cursor-canvas"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none"
      style={{ zIndex: 4 }}
    />
  );
}
