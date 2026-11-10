import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cosmicEngine, DEFAULT_VISUAL_PREFERENCES } from '../../engine/cosmicEngine';
import { useSingularityStore, type RepoSummary, type UserProfile } from '../../store/singularityStore';
import { api } from '../api';
import {
  firebaseSignOutSafe,
  getMissingFirebaseClientKeys,
  isFirebaseClientConfigured,
  signInWithGooglePopup,
} from '../firebaseClient';

const MOCK_USER: UserProfile = {
  id: 101,
  email: 'nova@singularity.dev',
  username: 'NovaEngineer',
  display_name: 'Nova Engineer',
  photo_url: null,
  provider: 'local',
  role: 'admin',
  account_status: 'active',
};

const REPO_A: RepoSummary = {
  id: 1,
  name: 'Singularity Engine',
  description: 'Core physics engine',
  languages: { typescript: 3 },
  file_count: 3,
  symbol_count: 12,
  chunk_count: 8,
  status: 'indexed',
  created_at: '2026-11-05T00:00:00Z',
};

const REPO_B: RepoSummary = {
  id: 2,
  name: 'Orbital Mesh',
  description: 'Associative memory store',
  languages: { python: 4 },
  file_count: 4,
  symbol_count: 19,
  chunk_count: 11,
  status: 'indexed',
  created_at: '2026-11-05T01:00:00Z',
};

describe('Singularity Store, API Silent-Refresh Client & Firebase Guards', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    useSingularityStore.setState({
      activeModule: 'chat',
      interactionState: 'IDLE',
      visualPreferences: { ...DEFAULT_VISUAL_PREFERENCES },
      webglSupported: true,
      forceStaticFallback: false,
      settingsModalOpen: false,
      authModalOpen: false,
      authReady: true,
      user: null,
      token: null,
      refreshToken: null,
      repos: [],
      selectedRepoId: null,
    });
    cosmicEngine.state = 'IDLE';
    cosmicEngine.preferences = { ...DEFAULT_VISUAL_PREFERENCES };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('enforces AI_THINKING priority lock, triggers cosmic pulses, and auto-resets state timer', () => {
    const pulseSpy = vi.spyOn(cosmicEngine, 'triggerPulse');
    const store = useSingularityStore.getState();

    store.setInteractionState('MESSAGE_SUBMITTED');
    expect(pulseSpy).toHaveBeenCalledWith('submission');

    // While AI_THINKING is active, ambient TYPING / CURSOR_ACTIVE / IDLE transitions are ignored
    store.setInteractionState('AI_THINKING');
    expect(useSingularityStore.getState().interactionState).toBe('AI_THINKING');

    store.setInteractionState('TYPING');
    store.setInteractionState('CURSOR_ACTIVE');
    store.setInteractionState('IDLE');
    expect(useSingularityStore.getState().interactionState).toBe('AI_THINKING');

    // High-priority AI_RESPONSE unlocks AI_THINKING and auto-resets back to IDLE after duration
    store.setInteractionState('AI_RESPONSE', 900);
    expect(useSingularityStore.getState().interactionState).toBe('AI_RESPONSE');
    expect(pulseSpy).toHaveBeenCalledWith('ai_response');

    vi.advanceTimersByTime(950);
    expect(useSingularityStore.getState().interactionState).toBe('IDLE');
    expect(cosmicEngine.state).toBe('IDLE');
  });

  it('toggles Focus Mode, manages repository selection fallbacks, and resets admin module on clearAuth', () => {
    const store = useSingularityStore.getState();

    expect(useSingularityStore.getState().visualPreferences.mode).toBe('cinematic');
    store.toggleFocusMode();
    expect(useSingularityStore.getState().visualPreferences.mode).toBe('focus');
    expect(cosmicEngine.preferences.mode).toBe('focus');
    store.toggleFocusMode();
    expect(useSingularityStore.getState().visualPreferences.mode).toBe('cinematic');

    // setRepos auto-selects first repo, preserves active selection, falls back on delete, and clears to null when empty
    store.setRepos([REPO_A, REPO_B]);
    expect(useSingularityStore.getState().selectedRepoId).toBe(1);

    store.setSelectedRepoId(2);
    store.setRepos([REPO_A, REPO_B]);
    expect(useSingularityStore.getState().selectedRepoId).toBe(2);

    store.setRepos([REPO_A]);
    expect(useSingularityStore.getState().selectedRepoId).toBe(1);

    store.setRepos([]);
    expect(useSingularityStore.getState().selectedRepoId).toBeNull();

    // Admin module resets to chat when clearAuth is invoked
    store.setAuth(MOCK_USER, 'access-tok-1', 'refresh-tok-1');
    store.setActiveModule('admin');
    expect(useSingularityStore.getState().activeModule).toBe('admin');

    store.clearAuth();
    expect(useSingularityStore.getState().user).toBeNull();
    expect(useSingularityStore.getState().token).toBeNull();
    expect(useSingularityStore.getState().refreshToken).toBeNull();
    expect(useSingularityStore.getState().activeModule).toBe('chat');
  });

  it('deduplicates concurrent 401 silent token refreshes and retries pending API requests cleanly', async () => {
    vi.useRealTimers();
    useSingularityStore.getState().setAuth(MOCK_USER, 'expired-access-token', 'valid-refresh-token');

    let refreshCallCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const auth = headers.get('Authorization');

      if (url === '/api/auth/refresh') {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(
          JSON.stringify({
            access_token: 'rotated-fresh-access-token',
            refresh_token: 'rotated-fresh-refresh-token',
            user: MOCK_USER,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (auth === 'Bearer expired-access-token') {
        return new Response(JSON.stringify({ detail: 'Token expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (auth === 'Bearer rotated-fresh-access-token') {
        if (url === '/api/repos') {
          return new Response(JSON.stringify([REPO_A]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(MOCK_USER), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ detail: 'Unexpected call' }), { status: 500 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const [repos, profile] = await Promise.all([api.listRepos(), api.getMe()]);
    expect(refreshCallCount).toBe(1);
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('Singularity Engine');
    expect(profile.email).toBe('nova@singularity.dev');
    expect(useSingularityStore.getState().token).toBe('rotated-fresh-access-token');
    expect(useSingularityStore.getState().refreshToken).toBe('rotated-fresh-refresh-token');
  });

  it('clears session on failed refresh and extracts Pydantic array validation errors cleanly', async () => {
    vi.useRealTimers();
    useSingularityStore.getState().setAuth(MOCK_USER, 'expired-tok', 'revoked-refresh-tok');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        return new Response(JSON.stringify({ detail: 'Refresh token revoked' }), { status: 401 });
      }
      if (url === '/api/repos') {
        return new Response(JSON.stringify({ detail: 'Invalid session' }), { status: 401 });
      }
      if (url === '/api/chat/send') {
        return new Response(
          JSON.stringify({ detail: [{ loc: ['body', 'message'], msg: 'String should have at least 1 character' }] }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(null, { status: 204 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(api.listRepos()).rejects.toThrow('Invalid session');
    expect(useSingularityStore.getState().token).toBeNull();
    expect(useSingularityStore.getState().user).toBeNull();

    await expect(api.sendChatMessage(''))
      .rejects.toThrow('String should have at least 1 character');
  });

  it('guards Firebase Google Sign-In cleanly when VITE_FIREBASE_* keys are unconfigured', async () => {
    vi.useRealTimers();
    const missing = getMissingFirebaseClientKeys();
    if (!isFirebaseClientConfigured()) {
      expect(missing.length).toBeGreaterThan(0);
      await expect(signInWithGooglePopup()).rejects.toThrow(/VITE_FIREBASE_API_KEY/);
      await expect(firebaseSignOutSafe()).resolves.toBeUndefined();
    } else {
      expect(missing).toEqual([]);
      expect(isFirebaseClientConfigured()).toBe(true);
    }
  });

  it('deduplicates concurrent createDevSession calls so StrictMode never spawns duplicate sessions', async () => {
    vi.useRealTimers();
    let devCalls = 0;
    globalThis.fetch = vi.fn(async () => {
      devCalls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(
        JSON.stringify({
          access_token: 'dev-access-1',
          refresh_token: 'dev-refresh-1',
          user: MOCK_USER,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const [s1, s2] = await Promise.all([api.createDevSession(), api.createDevSession()]);
    expect(devCalls).toBe(1);
    expect(s1.access_token).toBe('dev-access-1');
    expect(s2.access_token).toBe('dev-access-1');
  });
});
