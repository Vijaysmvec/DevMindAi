import { cosmicEngine, CosmicSimulationEngine } from '../engine/cosmicEngine';
import {
  CosmicSimulationManager,
  cosmicSimulationManager,
} from '../engine/CosmicSimulationManager';
import { CosmicAudioEngine, cosmicAudioEngine } from './CosmicAudioEngine';

/**
 * Connects the Singularity cosmicEngine + Cosmic Devourer celestial simulation pipeline
 * & browser tab lifecycle to CosmicAudioEngine without duplicate listeners.
 */
export class CosmicAudioEventBridge {
  private audioEngine: CosmicAudioEngine;
  private simEngine: CosmicSimulationEngine;
  private devourerManager: CosmicSimulationManager;
  private cleanups: Array<() => void> = [];
  private attached = false;

  constructor(
    audioEngine: CosmicAudioEngine = cosmicAudioEngine,
    simEngine: CosmicSimulationEngine = cosmicEngine,
    devourerManager: CosmicSimulationManager = cosmicSimulationManager
  ) {
    this.audioEngine = audioEngine;
    this.simEngine = simEngine;
    this.devourerManager = devourerManager;
  }

  public isAttached(): boolean {
    return this.attached;
  }

  public getActiveListenerCount(): number {
    return this.cleanups.length;
  }

  public attach(): () => void {
    if (this.attached) {
      return () => this.detach();
    }
    this.attached = true;

    const unsubApproach = this.simEngine.onParticleApproach((tension) => {
      this.audioEngine.handleParticleApproach(tension);
    });

    const unsubIngestion = this.simEngine.onParticleIngested((evt) => {
      this.audioEngine.handleParticleIngested(evt);
    });

    const unsubShockwave = this.simEngine.onShockwave((signal) => {
      this.audioEngine.handleCosmicShockwave(signal);
    });

    const unsubState = this.simEngine.onStateChange((next, prev) => {
      this.audioEngine.handleInteractionState(next, prev);
    });

    const unsubCelestial = this.devourerManager.onEvent((evt) => {
      this.audioEngine.handleCelestialEvent(evt);
    });

    this.cleanups.push(unsubApproach, unsubIngestion, unsubShockwave, unsubState, unsubCelestial);

    if (typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        void this.audioEngine.handlePageVisibilityChange(document.visibilityState === 'hidden');
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      this.cleanups.push(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      });
    }

    return () => this.detach();
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    while (this.cleanups.length > 0) {
      const fn = this.cleanups.pop();
      try {
        fn?.();
      } catch {
        // Ignore cleanup exceptions
      }
    }
  }
}

export const cosmicAudioEvents = new CosmicAudioEventBridge();
