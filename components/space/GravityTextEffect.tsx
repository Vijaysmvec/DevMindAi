import { useEffect, useRef } from 'react';
import {
  cosmicEngine,
  ParticleIngestionEvent,
  PARTICLE_SYSTEM_PARAMS,
} from '../../src/engine/cosmicEngine';
import { useSingularityStore } from '../../src/store/singularityStore';

const CFG = PARTICLE_SYSTEM_PARAMS.textDeletion;

type DeletionSource = Exclude<ParticleIngestionEvent['source'], 'ambient_infall'>;

interface GlyphParticle {
  id: number;
  batchId: number;
  glyph: string;
  source: DeletionSource;
  startX: number;
  startY: number;
  ctrlX: number;
  ctrlY: number;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  delayRemaining: number;
  progress: number;
  duration: number;
  rotation: number;
  spinSpeed: number;
  swirlSign: number;
  direction: 'infall' | 'undo';
  colorPrimary: string;
  fragments: Array<{ angle: number; speed: number; size: number }>;
}

interface DeletionSnapshot {
  batchId: number;
  timestamp: number;
  startIndex: number;
  length: number;
  glyphCoords: Array<{ offset: number; x: number; y: number; swirlSign: number }>;
}

interface InputMirrorState {
  text: string;
  selStart: number;
  selEnd: number;
  pendingInputType: string;
}

const MAX_ACTIVE_PARTICLES = CFG.maxActive;
const MAX_SNAPSHOTS = 20;
const SNAPSHOT_TTL_MS = 60_000;

/**
 * Measures approximate viewport (x, y) coordinates of character positions inside a native
 * <textarea> or <input> without altering the element or blocking native editing.
 */
function measureCharacterPositions(
  el: HTMLTextAreaElement | HTMLInputElement,
  referenceText: string,
  startIndex: number,
  count: number
): Array<{ x: number; y: number }> {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return [{ x: window.innerWidth * 0.45, y: window.innerHeight * 0.78 }];
  }

  const computed = window.getComputedStyle(el);
  const fontSize = parseFloat(computed.fontSize) || 14;

  // Sample up to 36 visual fragments if a large selection is deleted at once
  const step = Math.max(1, Math.ceil(count / 36));
  const results: Array<{ x: number; y: number }> = [];

  if (el.tagName === 'INPUT') {
    const padLeft = parseFloat(computed.paddingLeft) || 12;
    const padTop = parseFloat(computed.paddingTop) || 10;
    const charW = fontSize * 0.56;
    for (let i = 0; i < count; i += step) {
      const x = Math.min(
        rect.right - 12,
        Math.max(rect.left + 8, rect.left + padLeft + (startIndex + i) * charW - el.scrollLeft)
      );
      const y = rect.top + padTop + fontSize * 0.65;
      results.push({ x, y });
    }
    return results;
  }

  // Offscreen mirror measurement for multi-line <textarea>
  try {
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    const copyProps = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'lineHeight',
      'textTransform',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'boxSizing',
    ] as const;

    mirror.style.position = 'fixed';
    mirror.style.left = `${rect.left}px`;
    mirror.style.top = `${rect.top}px`;
    mirror.style.width = `${rect.width}px`;
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflow = 'hidden';

    for (const prop of copyProps) {
      mirror.style[prop] = computed[prop];
    }

    const prefixNode = document.createTextNode(referenceText.slice(0, startIndex));
    mirror.appendChild(prefixNode);

    const spans: HTMLSpanElement[] = [];
    for (let i = 0; i < count; i += step) {
      const ch =
        referenceText.slice(startIndex + i, Math.min(startIndex + count, startIndex + i + step)) ||
        ' ';
      const sp = document.createElement('span');
      sp.textContent = ch;
      mirror.appendChild(sp);
      spans.push(sp);
    }

    document.body.appendChild(mirror);
    for (const sp of spans) {
      const spRect = sp.getBoundingClientRect();
      const x = Math.min(
        rect.right - 10,
        Math.max(rect.left + 10, spRect.left + spRect.width * 0.5)
      );
      const y = Math.min(
        rect.bottom - 8,
        Math.max(rect.top + 10, spRect.top - el.scrollTop + spRect.height * 0.55)
      );
      results.push({ x, y });
    }
    document.body.removeChild(mirror);
  } catch {
    // Approximate fallback overlay position if DOM measurement ever fails
    results.push({ x: rect.left + 28, y: rect.top + 22 });
  }

  return results.length > 0 ? results : [{ x: rect.left + 28, y: rect.top + 22 }];
}

function resolveDeletionSource(
  inputType: string,
  hadSelection: boolean,
  hasInsertedReplacement: boolean,
  lastKey: string
): DeletionSource {
  if (inputType === 'deleteByCut') return 'cut';
  if (hasInsertedReplacement || inputType === 'insertReplacementText') return 'replace';
  if (hadSelection) return 'selection';
  if (inputType.includes('Forward') || lastKey === 'Delete') return 'delete';
  return 'backspace';
}

/**
 * Part A.2 System #6 & Part C (Sections 5 & 6):
 * - Gravitational Text Deletion (Backspace, Delete, Hold-Delete, Selection, Cut, Replacement)
 * - Tiny white/cyan/amber cosmic text-fragment glyphs with staggered group trajectories
 * - Actual trajectory Event Horizon crossing -> ParticleIngestionEvent -> Full-Screen Cosmic Shockwave
 * - Browser-native Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y preservation + in-flight path reversal & snapshot reconstruction
 */
export function GravityTextEffect() {
  const subGlassCanvasRef = useRef<HTMLCanvasElement>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);

  useEffect(() => {
    const particles: GlyphParticle[] = [];
    const snapshots: DeletionSnapshot[] = [];
    const mirrors = new WeakMap<HTMLTextAreaElement | HTMLInputElement, InputMirrorState>();
    let particleIdSeq = 1;
    let batchIdSeq = 1;
    let isComposing = false;
    let lastUndoKeyAt = 0;
    let lastRedoKeyAt = 0;
    let lastKeyPressed = '';

    if (typeof window !== 'undefined' && !import.meta.env.PROD) {
      const w = window as unknown as Record<string, number>;
      w.__DEVMIND_GRAVITY_LISTENERS__ = (w.__DEVMIND_GRAVITY_LISTENERS__ || 0) + 1;
    }

    const isGravityInput = (
      target: EventTarget | null
    ): target is HTMLTextAreaElement | HTMLInputElement => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) &&
        target.dataset.gravityInput === 'true'
      );
    };

    const syncSelectionOnly = (el: HTMLTextAreaElement | HTMLInputElement) => {
      const existing = mirrors.get(el);
      const selStart = el.selectionStart ?? el.value.length;
      const selEnd = el.selectionEnd ?? selStart;
      if (existing) {
        existing.selStart = selStart;
        existing.selEnd = selEnd;
      } else {
        mirrors.set(el, {
          text: el.value,
          selStart,
          selEnd,
          pendingInputType: '',
        });
      }
    };

    const spawnInfallParticles = (
      el: HTMLTextAreaElement | HTMLInputElement,
      prevText: string,
      delStart: number,
      deletedText: string,
      source: DeletionSource
    ) => {
      const prefs = cosmicEngine.preferences;
      if (!prefs.text_deletion_animation || prefs.reduced_motion) return;

      const visibleSlice = deletedText.replace(/\r/g, '');
      if (!visibleSlice.length) return;

      const coords = measureCharacterPositions(el, prevText, delStart, visibleSlice.length);
      const step = Math.max(1, Math.ceil(visibleSlice.length / Math.max(1, coords.length)));
      const bhX = cosmicEngine.blackHoleScreenX;
      const bhY = cosmicEngine.blackHoleScreenY;
      const batchId = batchIdSeq++;

      const snapshotCoords: DeletionSnapshot['glyphCoords'] = [];

      coords.forEach((pt, idx) => {
        const rawChar = visibleSlice[idx * step] || '·';
        const displayGlyph = rawChar.trim() === '' ? '·' : rawChar;
        const swirlSign = idx % 2 === 0 ? 1 : -1;

        const dx = bhX - pt.x;
        const dy = bhY - pt.y;
        const perpX = -dy * (0.30 + (idx % 3) * 0.04) * swirlSign;
        const perpY = dx * (0.30 + (idx % 3) * 0.04) * swirlSign;

        snapshotCoords.push({
          offset: idx * step,
          x: pt.x,
          y: pt.y,
          swirlSign,
        });

        if (particles.length >= MAX_ACTIVE_PARTICLES) {
          particles.shift();
        }

        particles.push({
          id: particleIdSeq++,
          batchId,
          glyph: displayGlyph,
          source,
          startX: pt.x,
          startY: pt.y,
          ctrlX: pt.x + dx * 0.46 + perpX,
          ctrlY: pt.y + dy * 0.46 + perpY,
          targetX: bhX,
          targetY: bhY,
          currentX: pt.x,
          currentY: pt.y,
          // Stagger trajectories subtly for multi-character / selection deletion
          delayRemaining: Math.min(0.22, idx * 0.016),
          progress: 0,
          duration: 0.76 + Math.min(0.26, idx * 0.018),
          rotation: 0,
          spinSpeed: (2.8 + Math.random() * 2.4) * swirlSign,
          swirlSign,
          direction: 'infall',
          colorPrimary: idx % 4 === 0 ? '#56D9FF' : '#FFF0D5',
          fragments: [
            { angle: 0.5, speed: 13, size: 1.1 },
            { angle: 2.4, speed: 17, size: 0.9 },
            { angle: 4.6, speed: 11, size: 1.0 },
          ],
        });
        cosmicEngine.totalDeletedGlyphsAnimated += 1;
      });

      const now = performance.now();
      snapshots.push({
        batchId,
        timestamp: now,
        startIndex: delStart,
        length: visibleSlice.length,
        glyphCoords: snapshotCoords,
      });
      while (
        snapshots.length > MAX_SNAPSHOTS ||
        (snapshots[0] && now - snapshots[0].timestamp > SNAPSHOT_TTL_MS)
      ) {
        snapshots.shift();
      }

      queueMicrotask(() => setInteractionState('TEXT_DELETION', 950));
    };

    const spawnUndoReversalParticles = (
      el: HTMLTextAreaElement | HTMLInputElement,
      nextText: string,
      insStart: number,
      restoredText: string
    ) => {
      const prefs = cosmicEngine.preferences;
      if (!prefs.undo_reversal_animation || prefs.reduced_motion) return;

      const cleanRestored = restoredText.replace(/\r/g, '');
      if (!cleanRestored.length) return;

      const now = performance.now();
      let matchedSnapIdx = -1;
      for (let i = snapshots.length - 1; i >= 0; i--) {
        const s = snapshots[i];
        if (now - s.timestamp <= SNAPSHOT_TTL_MS && Math.abs(s.startIndex - insStart) <= 4) {
          matchedSnapIdx = i;
          break;
        }
      }

      const matched = matchedSnapIdx >= 0 ? snapshots.splice(matchedSnapIdx, 1)[0] : null;
      const bhX = cosmicEngine.blackHoleScreenX;
      const bhY = cosmicEngine.blackHoleScreenY;

      // 1. Reverse any still-active in-flight infall particles from this matched batch right in mid-air!
      let reversedInFlightCount = 0;
      if (matched) {
        for (const p of particles) {
          if (p.direction === 'infall' && p.batchId === matched.batchId) {
            const destX = p.startX;
            const destY = p.startY;
            p.direction = 'undo';
            p.startX = p.currentX;
            p.startY = p.currentY;
            p.targetX = destX;
            p.targetY = destY;
            const dx = destX - p.currentX;
            const dy = destY - p.currentY;
            p.ctrlX = p.currentX + dx * 0.5 - dy * 0.24 * p.swirlSign;
            p.ctrlY = p.currentY + dy * 0.5 + dx * 0.24 * p.swirlSign;
            p.delayRemaining = 0;
            p.progress = 0;
            p.duration = 0.68;
            p.colorPrimary = '#56D9FF';
            reversedInFlightCount++;
            cosmicEngine.totalUndoGlyphsAnimated += 1;
          }
        }
      }

      if (reversedInFlightCount > 0 && matched && reversedInFlightCount >= matched.glyphCoords.length) {
        queueMicrotask(() => setInteractionState('TEXT_UNDO', 950));
        return;
      }

      // 2. Reconstruct outward particles from snapshot (or fresh coords) for already-ingested characters
      const freshCoords = measureCharacterPositions(el, nextText, insStart, cleanRestored.length);
      const step = Math.max(1, Math.ceil(cleanRestored.length / Math.max(1, freshCoords.length)));
      const undoBatchId = batchIdSeq++;

      freshCoords.forEach((destPt, idx) => {
        const snapPt = matched?.glyphCoords[idx];
        const endX = snapPt ? snapPt.x : destPt.x;
        const endY = snapPt ? snapPt.y : destPt.y;
        const swirlSign = snapPt ? snapPt.swirlSign : idx % 2 === 0 ? 1 : -1;

        const rawChar = cleanRestored[idx * step] || '·';
        const displayGlyph = rawChar.trim() === '' ? '·' : rawChar;

        const dx = endX - bhX;
        const dy = endY - bhY;
        const perpX = -dy * 0.30 * swirlSign;
        const perpY = dx * 0.30 * swirlSign;

        if (particles.length >= MAX_ACTIVE_PARTICLES) {
          particles.shift();
        }

        particles.push({
          id: particleIdSeq++,
          batchId: undoBatchId,
          glyph: displayGlyph,
          source: 'backspace',
          startX: bhX,
          startY: bhY,
          ctrlX: bhX + dx * 0.52 + perpX,
          ctrlY: bhY + dy * 0.52 + perpY,
          targetX: endX,
          targetY: endY,
          currentX: bhX,
          currentY: bhY,
          delayRemaining: Math.min(0.18, idx * 0.014),
          progress: 0,
          duration: 0.74 + Math.min(0.24, idx * 0.018),
          rotation: swirlSign * Math.PI * 1.3,
          spinSpeed: -2.4 * swirlSign,
          swirlSign,
          direction: 'undo',
          colorPrimary: '#56D9FF',
          fragments: [
            { angle: 1.1, speed: 12, size: 1.0 },
            { angle: 3.8, speed: 15, size: 0.9 },
          ],
        });
        cosmicEngine.totalUndoGlyphsAnimated += 1;
      });

      queueMicrotask(() => setInteractionState('TEXT_UNDO', 950));
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isGravityInput(e.target)) {
        mirrors.set(e.target, {
          text: e.target.value,
          selStart: e.target.selectionStart ?? e.target.value.length,
          selEnd: e.target.selectionEnd ?? e.target.value.length,
          pendingInputType: '',
        });
      }
    };

    const onSelectOrPointer = (e: Event) => {
      if (isGravityInput(e.target)) {
        syncSelectionOnly(e.target);
      }
    };

    const onBeforeInput = (e: Event) => {
      if (!isGravityInput(e.target)) return;
      const el = e.target;
      const ie = e as InputEvent;
      mirrors.set(el, {
        text: el.value,
        selStart: el.selectionStart ?? el.value.length,
        selEnd: el.selectionEnd ?? el.value.length,
        pendingInputType: ie.inputType || '',
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isGravityInput(e.target)) return;
      lastKeyPressed = e.key;
      syncSelectionOnly(e.target);

      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          lastUndoKeyAt = performance.now();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
          lastRedoKeyAt = performance.now();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isGravityInput(e.target)) {
        syncSelectionOnly(e.target);
      }
    };

    const onCompositionStart = () => {
      isComposing = true;
    };

    const onCompositionEnd = (e: CompositionEvent) => {
      isComposing = false;
      if (isGravityInput(e.target)) {
        mirrors.set(e.target, {
          text: e.target.value,
          selStart: e.target.selectionStart ?? e.target.value.length,
          selEnd: e.target.selectionEnd ?? e.target.value.length,
          pendingInputType: '',
        });
      }
    };

    const onInput = (e: Event) => {
      if (!isGravityInput(e.target)) return;
      const el = e.target;
      const prevMirror = mirrors.get(el);
      const prev = prevMirror?.text ?? '';
      const preSelStart = prevMirror?.selStart ?? prev.length;
      const preSelEnd = prevMirror?.selEnd ?? preSelStart;
      const next = el.value;

      const inputEvt = e as InputEvent;
      const inputType = inputEvt.inputType || prevMirror?.pendingInputType || '';

      mirrors.set(el, {
        text: next,
        selStart: el.selectionStart ?? next.length,
        selEnd: el.selectionEnd ?? next.length,
        pendingInputType: '',
      });

      if (isComposing || prev === next) return;

      // Programmatic clear upon message submission
      if (next === '' && cosmicEngine.state === 'MESSAGE_SUBMITTED') {
        return;
      }

      const now = performance.now();
      const hadSelection = preSelEnd > preSelStart;

      // Exact range resolution using pre-input selection/caret when available, with diff fallback
      let delStart = 0;
      let deletedText = '';
      let insertedText = '';

      if (hadSelection && preSelEnd <= prev.length) {
        const expectedSuffixLen = prev.length - preSelEnd;
        const nextMiddleEnd = Math.max(preSelStart, next.length - expectedSuffixLen);
        if (
          prev.slice(0, preSelStart) === next.slice(0, preSelStart) &&
          prev.slice(preSelEnd) === next.slice(nextMiddleEnd)
        ) {
          delStart = preSelStart;
          deletedText = prev.slice(preSelStart, preSelEnd);
          insertedText = next.slice(preSelStart, nextMiddleEnd);
        }
      } else if (!hadSelection && next.length < prev.length) {
        const dropCount = prev.length - next.length;
        if (
          (inputType.includes('Forward') || lastKeyPressed === 'Delete') &&
          preSelStart + dropCount <= prev.length &&
          prev.slice(0, preSelStart) + prev.slice(preSelStart + dropCount) === next
        ) {
          delStart = preSelStart;
          deletedText = prev.slice(preSelStart, preSelStart + dropCount);
        } else if (
          preSelStart - dropCount >= 0 &&
          prev.slice(0, preSelStart - dropCount) + prev.slice(preSelStart) === next
        ) {
          delStart = preSelStart - dropCount;
          deletedText = prev.slice(preSelStart - dropCount, preSelStart);
        }
      }

      // Fallback general prefix/suffix diff (handles historyUndo, historyRedo, paste, programmatic edits)
      if (!deletedText && !insertedText) {
        let prefixLen = 0;
        const minLen = Math.min(prev.length, next.length);
        while (prefixLen < minLen && prev[prefixLen] === next[prefixLen]) {
          prefixLen++;
        }

        let suffixLen = 0;
        while (
          suffixLen < prev.length - prefixLen &&
          suffixLen < next.length - prefixLen &&
          prev[prev.length - 1 - suffixLen] === next[next.length - 1 - suffixLen]
        ) {
          suffixLen++;
        }

        delStart = prefixLen;
        deletedText = prev.slice(prefixLen, prev.length - suffixLen);
        insertedText = next.slice(prefixLen, next.length - suffixLen);
      }

      const isHistoryUndo =
        inputType === 'historyUndo' || (now - lastUndoKeyAt < 220 && insertedText.length > 0);
      const isHistoryRedo =
        inputType === 'historyRedo' || (now - lastRedoKeyAt < 220 && deletedText.length > 0);

      if (isHistoryUndo && insertedText.length > 0) {
        spawnUndoReversalParticles(el, next, delStart, insertedText);
        return;
      }

      if (isHistoryRedo && deletedText.length > 0) {
        spawnInfallParticles(el, prev, delStart, deletedText, 'backspace');
        return;
      }

      if (deletedText.length > 0) {
        const source = resolveDeletionSource(
          inputType,
          hadSelection,
          insertedText.length > 0,
          lastKeyPressed
        );
        spawnInfallParticles(el, prev, delStart, deletedText, source);
      } else if (insertedText.length > 0) {
        queueMicrotask(() => setInteractionState('TYPING', 950));
      }
    };

    const onSyncMirror = (e: Event) => {
      const detail = (
        e as CustomEvent<{ element: HTMLTextAreaElement | HTMLInputElement; text: string }>
      ).detail;
      if (detail?.element) {
        mirrors.set(detail.element, {
          text: detail.text,
          selStart: detail.text.length,
          selEnd: detail.text.length,
          pendingInputType: '',
        });
      }
    };

    document.addEventListener('focusin', onFocusIn, false);
    document.addEventListener('select', onSelectOrPointer, false);
    document.addEventListener('pointerup', onSelectOrPointer, false);
    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('compositionstart', onCompositionStart, false);
    document.addEventListener('compositionend', onCompositionEnd, false);
    document.addEventListener('input', onInput, false);
    window.addEventListener('singularity:sync-input-mirror', onSyncMirror);

    let canvasesDirty = true;

    const resizeCanvases = () => {
      const dpr = 1;
      for (const canvas of [subGlassCanvasRef.current, foregroundCanvasRef.current]) {
        if (!canvas) continue;
        canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
        canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      canvasesDirty = true;
    };

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    let rafId = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const subCanvas = subGlassCanvasRef.current;
      const fgCanvas = foregroundCanvasRef.current;
      const subCtx = subCanvas?.getContext('2d');
      const fgCtx = fgCanvas?.getContext('2d');

      if (subCtx && fgCtx && !cosmicEngine.isPageHidden) {
        if (particles.length === 0) {
          if (canvasesDirty) {
            subCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            fgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            cosmicEngine.activeIngoingGlyphs = 0;
            cosmicEngine.activeUndoGlyphs = 0;
            cosmicEngine.sampleParticlePositions = [];
            cosmicEngine.reportParticleApproach(0, 0);
            canvasesDirty = false;
          }
          rafId = window.requestAnimationFrame(renderFrame);
          return;
        }

        canvasesDirty = true;
        subCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        fgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        let ingoingCount = 0;
        let undoCount = 0;
        let maxApproachTension = 0;
        const telemetryPositions: typeof cosmicEngine.sampleParticlePositions = [];

        const bhX = cosmicEngine.blackHoleScreenX;
        const bhY = cosmicEngine.blackHoleScreenY;

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];

          if (p.delayRemaining > 0) {
            p.delayRemaining = Math.max(0, p.delayRemaining - dt);
            if (p.direction === 'infall') ingoingCount++;
            else undoCount++;
            continue;
          }

          p.progress += dt / p.duration;

          if (p.direction === 'infall') {
            p.targetX = bhX;
            p.targetY = bhY;

            // Relativistic gravitational acceleration (accelerates sharply near Event Horizon)
            const t = Math.pow(Math.min(1, p.progress), 1.92);
            const inv = 1 - t;

            // Curved orbital spiral into accretion disk & Event Horizon
            const spiralAngle = t * t * 4.8 * p.swirlSign;
            const spiralRadius = (1 - t) * 22 * Math.sin(t * Math.PI);
            const x =
              inv * inv * p.startX +
              2 * inv * t * p.ctrlX +
              t * t * p.targetX +
              Math.cos(spiralAngle) * spiralRadius;
            const y =
              inv * inv * p.startY +
              2 * inv * t * p.ctrlY +
              t * t * p.targetY +
              Math.sin(spiralAngle) * spiralRadius * 0.62;

            p.currentX = x;
            p.currentY = y;

            // Stage 10-13: Trajectory-verified Event Horizon crossing!
            const distToHorizon = Math.hypot(x - bhX, y - bhY);
            if (
              (p.progress >= 0.42 && distToHorizon <= CFG.eventHorizonRadiusPx) ||
              p.progress >= 0.98
            ) {
              particles.splice(i, 1);
              cosmicEngine.registerParticleIngestion({
                particleId: `glyph-${p.id}`,
                particleType: 'glyph',
                entryPosition: { x, y },
                energyIntensity: 0.56,
                source: p.source,
              });
              continue;
            }

            ingoingCount++;
            if (p.progress > 0.16) {
              const approach = Math.min(1, (p.progress - 0.16) / 0.78);
              if (approach > maxApproachTension) {
                maxApproachTension = approach;
              }
            }
            p.rotation += p.spinSpeed * (1 + t * 2.8) * dt;

            // Foreground detachment (0..0.32) transitions behind crystal-clear glass (0.24..1.0)
            const isSubGlass = p.progress >= 0.28;
            const fgWeight = 1 - Math.min(1, Math.max(0, (p.progress - 0.22) / 0.14));
            const subWeight = Math.min(1, Math.max(0, (p.progress - 0.20) / 0.14));

            // Tiny cosmic fragment scaling: starts at 11px fragment, compresses into ~1.6px plasma grain
            const scale = Math.max(0.16, 0.96 - t * 0.80);
            const stretchX = 1.0 + Math.pow(t, 2.2) * 1.55;
            const horizonFade = Math.min(1, Math.max(0.18, distToHorizon / (CFG.eventHorizonRadiusPx * 2.4)));

            const drawOnContext = (ctx: CanvasRenderingContext2D, layerAlpha: number) => {
              if (layerAlpha <= 0.01) return;
              ctx.save();

              // Fine curved cyan -> warm amber particle trail
              const trailX = x - (p.targetX - p.startX) * 0.036 * (0.4 + t);
              const trailY = y - (p.targetY - p.startY) * 0.036 * (0.4 + t);
              const grad = ctx.createLinearGradient(trailX, trailY, x, y);
              grad.addColorStop(0, 'rgba(232, 135, 50, 0)');
              grad.addColorStop(0.55, 'rgba(86, 217, 255, 0.48)');
              grad.addColorStop(1, t > 0.45 ? 'rgba(255, 179, 71, 0.78)' : 'rgba(255, 240, 213, 0.72)');
              ctx.strokeStyle = grad;
              ctx.lineWidth = Math.max(0.75, 1.55 * scale);
              ctx.globalAlpha = layerAlpha * horizonFade * 0.88;
              ctx.beginPath();
              ctx.moveTo(trailX, trailY);
              ctx.lineTo(x, y);
              ctx.stroke();

              // Fine accretion micro-grain sparks
              if (p.progress > 0.46) {
                const fragPhase = (p.progress - 0.46) / 0.54;
                for (let fIdx = 0; fIdx < p.fragments.length; fIdx++) {
                  const f = p.fragments[fIdx];
                  const fx = x + Math.cos(f.angle + p.rotation) * f.speed * fragPhase;
                  const fy = y + Math.sin(f.angle + p.rotation) * f.speed * fragPhase;
                  ctx.fillStyle = fIdx === 0 ? '#56D9FF' : '#E88732';
                  ctx.globalAlpha = layerAlpha * horizonFade * (1 - fragPhase) * 0.82;
                  ctx.beginPath();
                  ctx.arc(fx, fy, Math.max(0.55, f.size * scale), 0, Math.PI * 2);
                  ctx.fill();
                }
              }

              // Tiny white glyph fragment with fine cyan highlight & warm amber edge
              ctx.translate(x, y);
              ctx.rotate(p.rotation);
              ctx.scale(scale * stretchX, scale);
              ctx.font = `500 ${CFG.fontSizePx}px "JetBrains Mono", monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              if (p.progress < 0.72) {
                const edgeColor = p.progress < 0.36 ? '#56D9FF' : '#E88732';
                ctx.shadowColor = edgeColor;
                ctx.shadowBlur = 5;
                ctx.fillStyle = p.progress < 0.52 ? p.colorPrimary : '#FFF0D5';
                ctx.globalAlpha = layerAlpha * horizonFade;
                ctx.fillText(p.glyph, 0, 0);
              } else {
                // Near horizon: compressed stellar-white plasma grain with amber halo
                ctx.shadowColor = '#FFB347';
                ctx.shadowBlur = 4;
                ctx.fillStyle = '#FFF0D5';
                ctx.globalAlpha = layerAlpha * horizonFade;
                ctx.beginPath();
                ctx.arc(0, 0, 1.9, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.restore();
            };

            drawOnContext(fgCtx, fgWeight);
            drawOnContext(subCtx, subWeight);

            if (telemetryPositions.length < 8) {
              telemetryPositions.push({
                x: Math.round(x),
                y: Math.round(y),
                progress: Number(p.progress.toFixed(3)),
                layer: isSubGlass ? 'subglass' : 'foreground',
                direction: 'infall',
              });
            }
          } else {
            // Part C.6: Native Undo Reversal — Reconstructing & escaping back to input
            if (p.progress >= 1.0) {
              particles.splice(i, 1);
              continue;
            }

            undoCount++;
            const t = 1 - Math.pow(1 - p.progress, 2.4);
            const inv = 1 - t;

            const spiralAngle = (1 - t) * 3.2 * p.swirlSign;
            const spiralRadius = (1 - t) * 18 * Math.sin(t * Math.PI);
            const x =
              inv * inv * p.startX +
              2 * inv * t * p.ctrlX +
              t * t * p.targetX +
              Math.cos(spiralAngle) * spiralRadius;
            const y =
              inv * inv * p.startY +
              2 * inv * t * p.ctrlY +
              t * t * p.targetY +
              Math.sin(spiralAngle) * spiralRadius * 0.58;

            p.currentX = x;
            p.currentY = y;

            const rot = p.rotation * (1 - t);
            const scale = 0.28 + t * 0.72;
            const stretchX = 1.0 + Math.pow(1 - t, 2.1) * 1.15;
            const settleFade =
              p.progress > 0.88 ? 1 - (p.progress - 0.88) / 0.12 : Math.min(1, p.progress * 5);

            const subWeight = 1 - Math.min(1, Math.max(0, (p.progress - 0.56) / 0.16));
            const fgWeight = Math.min(1, Math.max(0, (p.progress - 0.52) / 0.16));

            const drawReverse = (ctx: CanvasRenderingContext2D, layerAlpha: number) => {
              if (layerAlpha <= 0.01) return;
              ctx.save();

              const tailX = x - (p.targetX - p.startX) * 0.042 * (1.05 - t * 0.55);
              const tailY = y - (p.targetY - p.startY) * 0.042 * (1.05 - t * 0.55);
              const grad = ctx.createLinearGradient(tailX, tailY, x, y);
              grad.addColorStop(0, 'rgba(255, 179, 71, 0)');
              grad.addColorStop(1, 'rgba(86, 217, 255, 0.72)');
              ctx.strokeStyle = grad;
              ctx.lineWidth = 1.35;
              ctx.globalAlpha = layerAlpha * settleFade * 0.85;
              ctx.beginPath();
              ctx.moveTo(tailX, tailY);
              ctx.lineTo(x, y);
              ctx.stroke();

              ctx.translate(x, y);
              ctx.rotate(rot);
              ctx.scale(scale * stretchX, scale);
              ctx.font = `500 ${CFG.fontSizePx}px "JetBrains Mono", monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const color = p.progress < 0.42 ? '#FFB347' : p.progress < 0.78 ? '#56D9FF' : '#FFF0D5';
              ctx.shadowColor = '#56D9FF';
              ctx.shadowBlur = 5;
              ctx.fillStyle = color;
              ctx.globalAlpha = layerAlpha * settleFade;
              ctx.fillText(p.glyph, 0, 0);
              ctx.restore();
            };

            drawReverse(subCtx, subWeight);
            drawReverse(fgCtx, fgWeight);

            if (telemetryPositions.length < 8) {
              telemetryPositions.push({
                x: Math.round(x),
                y: Math.round(y),
                progress: Number(p.progress.toFixed(3)),
                layer: p.progress >= 0.60 ? 'foreground' : 'subglass',
                direction: 'undo',
              });
            }
          }
        }

        cosmicEngine.activeIngoingGlyphs = ingoingCount;
        cosmicEngine.activeUndoGlyphs = undoCount;
        cosmicEngine.sampleParticlePositions = telemetryPositions;
        cosmicEngine.reportParticleApproach(maxApproachTension, ingoingCount);
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      if (typeof window !== 'undefined' && !import.meta.env.PROD) {
        const w = window as unknown as Record<string, number>;
        w.__DEVMIND_GRAVITY_LISTENERS__ = Math.max(0, (w.__DEVMIND_GRAVITY_LISTENERS__ || 1) - 1);
      }
      document.removeEventListener('focusin', onFocusIn, false);
      document.removeEventListener('select', onSelectOrPointer, false);
      document.removeEventListener('pointerup', onSelectOrPointer, false);
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, false);
      document.removeEventListener('compositionstart', onCompositionStart, false);
      document.removeEventListener('compositionend', onCompositionEnd, false);
      document.removeEventListener('input', onInput, false);
      window.removeEventListener('singularity:sync-input-mirror', onSyncMirror);
      window.removeEventListener('resize', resizeCanvases);
      window.cancelAnimationFrame(rafId);
    };
  }, [setInteractionState]);

  return (
    <>
      {/* Sub-Glass Singularity Portal Overlay (passes BEHIND z-10 crystal glass into Event Horizon) */}
      <canvas
        ref={subGlassCanvasRef}
        data-testid="gravity-subglass-canvas"
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none select-none"
        style={{ zIndex: 2 }}
      />

      {/* Foreground Character Detachment Overlay (never blocks pointer or keyboard interaction) */}
      <canvas
        ref={foregroundCanvasRef}
        data-testid="gravity-foreground-canvas"
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none select-none"
        style={{ zIndex: 30 }}
      />
    </>
  );
}
