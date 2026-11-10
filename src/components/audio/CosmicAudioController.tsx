import { useEffect, useState } from 'react';
import { ChevronDown, Volume2, VolumeX } from 'lucide-react';
import {
  CosmicAudioEngine,
  cosmicAudioEngine,
  CosmicAudioSnapshot,
} from '../../audio/CosmicAudioEngine';
import { CosmicAudioEventBridge, cosmicAudioEvents } from '../../audio/CosmicAudioEvents';
import { useSingularityStore } from '../../store/singularityStore';
import { AudioVisualizer } from './AudioVisualizer';
import { CosmicAudioSettings } from './CosmicAudioSettings';

interface CosmicAudioControllerProps {
  engine?: CosmicAudioEngine;
  eventBridge?: CosmicAudioEventBridge;
}

/**
 * Top-right compact crystal-glass Cosmic Audio control pill & workstation lifecycle coordinator.
 * Mounts inside the authenticated workstation navbar and silences immediately on logout/unmount.
 */
export function CosmicAudioController({
  engine = cosmicAudioEngine,
  eventBridge = cosmicAudioEvents,
}: CosmicAudioControllerProps) {
  const user = useSingularityStore((s) => s.user);
  const [snapshot, setSnapshot] = useState<CosmicAudioSnapshot>(() => engine.getSnapshot());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Subscribe React UI to CosmicAudioEngine state changes
  useEffect(() => {
    const unsub = engine.subscribe((next) => {
      setSnapshot(next);
    });
    setSnapshot(engine.getSnapshot());
    return unsub;
  }, [engine]);

  // Synchronize authenticated user preferences & guarantee silence when unauthenticated
  useEffect(() => {
    engine.setAuthenticatedUser(user?.id ?? null);
    return () => {
      engine.setAuthenticatedUser(null);
    };
  }, [engine, user?.id]);

  // Attach cosmicEngine event bridge on mount and clean up all listeners on unmount
  useEffect(() => {
    const detach = eventBridge.attach();
    return () => {
      detach();
    };
  }, [eventBridge]);

  // If user previously enabled audio in a saved session, unlock smoothly on their next legitimate gesture
  useEffect(() => {
    if (!snapshot.needsGestureUnlock) return;

    const unlockOnGesture = () => {
      void engine.resumeSavedSessionFromGesture();
    };

    window.addEventListener('pointerdown', unlockOnGesture, { once: true, passive: true });
    window.addEventListener('keydown', unlockOnGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
    };
  }, [engine, snapshot.needsGestureUnlock]);

  const { preferences, isAudible, needsGestureUnlock } = snapshot;
  const isActiveVisual = preferences.enabled && !preferences.muted;

  const toggleButtonLabel = !preferences.enabled
    ? 'Enable Cosmic Audio'
    : preferences.muted
      ? 'Unmute Cosmic Audio'
      : 'Mute Cosmic Audio';

  return (
    <div
      data-testid="cosmic-audio-controller"
      className="inline-flex items-center rounded-xl bg-white/[0.05] border border-white/15 hover:border-[#56D9FF]/45 shadow-[inset_0_1px_0_rgba(210,230,255,0.16)] transition-all"
    >
      {/* Primary Master Enable / Instant Mute Action */}
      <button
        type="button"
        data-testid="topbar-audio-toggle-btn"
        onClick={() => {
          void engine.toggleMuteFromUserGesture();
        }}
        title={
          !preferences.enabled
            ? 'Enable Cosmic Audio (Singularity Soundscape)'
            : preferences.muted
              ? 'Unmute Cosmic Audio'
              : 'Mute Cosmic Audio instantly'
        }
        aria-label={toggleButtonLabel}
        aria-pressed={isActiveVisual}
        className={`px-2.5 py-1.5 rounded-l-xl text-xs font-medium flex items-center gap-1.5 transition-colors ${
          isAudible
            ? 'text-[#56D9FF] bg-[#56D9FF]/12'
            : needsGestureUnlock
              ? 'text-[#FFB347] bg-[#FFB347]/12'
              : 'text-[#FFF0D5]/85 hover:text-[#56D9FF]'
        }`}
      >
        {isActiveVisual ? (
          <Volume2 className="w-3.5 h-3.5 text-[#56D9FF]" />
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-[#FFF0D5]/65" />
        )}
        <span className="hidden lg:inline">
          {!preferences.enabled
            ? 'Enable Audio'
            : preferences.muted
              ? 'Muted'
              : needsGestureUnlock
                ? 'Resume Audio'
                : 'Audio'}
        </span>
        <AudioVisualizer engine={engine} active={isActiveVisual} />
      </button>

      {/* Expandable Audio Settings Popover Trigger */}
      <button
        type="button"
        data-testid="topbar-audio-settings-btn"
        onClick={() => setSettingsOpen((prev) => !prev)}
        title="Cosmic Audio Settings & Presets"
        aria-label="Open Cosmic Audio Settings"
        aria-expanded={settingsOpen}
        aria-haspopup="dialog"
        className={`px-2 py-1.5 rounded-r-xl border-l border-white/12 text-[#FFF0D5]/75 hover:text-[#FFB347] transition-colors ${
          settingsOpen ? 'bg-[#56D9FF]/18 text-[#56D9FF]' : ''
        }`}
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            settingsOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <CosmicAudioSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        snapshot={snapshot}
        engine={engine}
      />
    </div>
  );
}
