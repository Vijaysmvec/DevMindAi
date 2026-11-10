import { create } from 'zustand';
import {
  cosmicEngine,
  CosmicInteractionState,
  DEFAULT_VISUAL_PREFERENCES,
  VisualPreferences,
} from '../engine/cosmicEngine';

export type ModuleId =
  | 'dashboard'
  | 'chat'
  | 'repos'
  | 'architecture'
  | 'review'
  | 'security'
  | 'model-doctor'
  | 'memory-mesh'
  | 'docs'
  | 'admin';

export interface UserProfile {
  id: number;
  firebase_uid?: string | null;
  email: string;
  username: string;
  display_name?: string;
  photo_url?: string | null;
  provider?: 'google' | 'local' | string;
  role?: 'user' | 'admin' | string;
  account_status?: 'active' | 'disabled' | 'deleted' | string;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface RepoSummary {
  id: number;
  name: string;
  description: string;
  languages: Record<string, number>;
  file_count: number;
  symbol_count: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

interface SingularityAppState {
  activeModule: ModuleId;
  interactionState: CosmicInteractionState;
  visualPreferences: VisualPreferences;
  webglSupported: boolean;
  forceStaticFallback: boolean;
  settingsModalOpen: boolean;
  authModalOpen: boolean;
  authReady: boolean;

  user: UserProfile | null;
  token: string | null;
  refreshToken: string | null;

  repos: RepoSummary[];
  selectedRepoId: number | null;

  setActiveModule: (mod: ModuleId) => void;
  setInteractionState: (next: CosmicInteractionState, autoResetMs?: number) => void;
  setVisualPreferences: (partial: Partial<VisualPreferences>) => void;
  toggleFocusMode: () => void;
  setWebglSupported: (supported: boolean) => void;
  setForceStaticFallback: (force: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  setAuthReady: (ready: boolean) => void;

  setAuth: (user: UserProfile | null, token: string | null, refreshToken?: string | null) => void;
  clearAuth: () => void;
  setRepos: (repos: RepoSummary[]) => void;
  setSelectedRepoId: (id: number | null) => void;
}

let stateResetTimer: ReturnType<typeof setTimeout> | null = null;

function detectInitialReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function detectInitialFallbackQuery(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('webgl') === 'fallback';
}

function syncDocumentGlassVariables(prefs: VisualPreferences): void {
  if (typeof document === 'undefined') return;
  const effectiveAlpha =
    prefs.mode === 'focus' ? Math.max(prefs.glass_transparency, 0.72) : prefs.glass_transparency;
  document.documentElement.style.setProperty('--glass-alpha', String(effectiveAlpha));
  document.documentElement.style.setProperty(
    '--glass-reflection-opacity',
    prefs.dynamic_glass_reflections && prefs.mode === 'cinematic' ? '1' : '0.18'
  );
}

const initialPrefs: VisualPreferences = {
  ...DEFAULT_VISUAL_PREFERENCES,
  reduced_motion: detectInitialReducedMotion(),
};
cosmicEngine.preferences = { ...initialPrefs };
syncDocumentGlassVariables(initialPrefs);

// Scrub any legacy client-side keys or persistent tokens from localStorage on startup
// so new browser sessions always start cleanly at the Login / Sign Up portal
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('devmind_gemini_key');
    localStorage.removeItem('devmind_token');
    localStorage.removeItem('devmind_refresh_token');
  } catch {
    // ignore storage access errors
  }
}

export const useSingularityStore = create<SingularityAppState>((set, get) => ({
  activeModule: 'chat',
  interactionState: 'IDLE',
  visualPreferences: initialPrefs,
  webglSupported: true,
  forceStaticFallback: detectInitialFallbackQuery(),
  settingsModalOpen: false,
  authModalOpen: false,
  authReady: false,

  user: null,
  token: typeof window !== 'undefined' ? sessionStorage.getItem('devmind_token') : null,
  refreshToken: typeof window !== 'undefined' ? sessionStorage.getItem('devmind_refresh_token') : null,

  repos: [],
  selectedRepoId: null,

  setActiveModule: (mod) => set({ activeModule: mod }),

  setInteractionState: (next, autoResetMs) => {
    const current = get().interactionState;
    if (
      current === 'AI_THINKING' &&
      (next === 'CURSOR_ACTIVE' || next === 'TYPING' || next === 'IDLE')
    ) {
      return;
    }

    if (stateResetTimer) {
      clearTimeout(stateResetTimer);
      stateResetTimer = null;
    }

    cosmicEngine.notifyStateChange(next);
    if (next === 'MESSAGE_SUBMITTED') {
      cosmicEngine.triggerPulse('submission');
    } else if (next === 'AI_RESPONSE') {
      cosmicEngine.triggerPulse('ai_response');
    } else if (next === 'ERROR') {
      cosmicEngine.triggerPulse('error');
    }

    set({ interactionState: next });

    if (autoResetMs && autoResetMs > 0) {
      stateResetTimer = setTimeout(() => {
        if (get().interactionState === next) {
          cosmicEngine.notifyStateChange('IDLE');
          set({ interactionState: 'IDLE' });
        }
      }, autoResetMs);
    }
  },

  setVisualPreferences: (partial) => {
    const merged: VisualPreferences = { ...get().visualPreferences, ...partial };
    cosmicEngine.preferences = merged;
    syncDocumentGlassVariables(merged);

    set({ visualPreferences: merged });
  },

  toggleFocusMode: () => {
    const nextMode = get().visualPreferences.mode === 'focus' ? 'cinematic' : 'focus';
    get().setVisualPreferences({ mode: nextMode });
  },

  setWebglSupported: (supported) => set({ webglSupported: supported }),
  setForceStaticFallback: (force) => set({ forceStaticFallback: force }),
  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
  setAuthModalOpen: (open) => set({ authModalOpen: open }),
  setAuthReady: (ready) => set({ authReady: ready }),

  setAuth: (user, token, refreshToken) => {
    const nextRefresh = refreshToken === undefined ? get().refreshToken : refreshToken;
    if (typeof window !== 'undefined') {
      if (token) sessionStorage.setItem('devmind_token', token);
      else sessionStorage.removeItem('devmind_token');

      if (nextRefresh) sessionStorage.setItem('devmind_refresh_token', nextRefresh);
      else sessionStorage.removeItem('devmind_refresh_token');

      if (token) sessionStorage.removeItem('devmind_logged_out');
    }
    set({ user, token, refreshToken: nextRefresh });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('devmind_token');
      sessionStorage.removeItem('devmind_refresh_token');
      localStorage.removeItem('devmind_token');
      localStorage.removeItem('devmind_refresh_token');
    }
    const activeMod = get().activeModule === 'admin' ? 'chat' : get().activeModule;
    set({
      user: null,
      token: null,
      refreshToken: null,
      repos: [],
      selectedRepoId: null,
      activeModule: activeMod,
    });
  },

  setRepos: (repos) => {
    const currentSelected = get().selectedRepoId;
    const nextSelected =
      currentSelected && repos.some((r) => r.id === currentSelected)
        ? currentSelected
        : repos.length > 0
          ? repos[0].id
          : null;
    set({ repos, selectedRepoId: nextSelected });
  },

  setSelectedRepoId: (id) => set({ selectedRepoId: id }),
}));
