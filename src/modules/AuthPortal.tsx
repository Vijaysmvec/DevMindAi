import React, { useEffect, useState } from 'react';
import { Check, LogIn, ShieldAlert, Sparkles, UserPlus } from 'lucide-react';
import { GlassInput } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import {
  consumeGoogleRedirectResult,
  getMissingFirebaseClientKeys,
  isFirebaseClientConfigured,
  signInWithGooglePopup,
  signInWithGoogleRedirect,
} from '../services/firebaseClient';
import { useSingularityStore } from '../store/singularityStore';

interface AuthPortalProps {
  initialMode?: 'login' | 'register';
}

export function AuthPortal({ initialMode }: AuthPortalProps) {
  const setAuth = useSingularityStore((s) => s.setAuth);
  const setRepos = useSingularityStore((s) => s.setRepos);
  const setVisualPreferences = useSingularityStore((s) => s.setVisualPreferences);

  const [mode, setMode] = useState<'login' | 'register'>(() => {
    if (initialMode) return initialMode;
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('mode');
      if (param === 'register' || param === 'signup') return 'register';
    }
    return 'login';
  });

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showFirebaseChecklist, setShowFirebaseChecklist] = useState(false);
  const [firebaseConfigNeeded, setFirebaseConfigNeeded] = useState(false);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [offerRedirectFallback, setOfferRedirectFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firebaseReady = isFirebaseClientConfigured();
  const missingFirebaseKeys = getMissingFirebaseClientKeys();

  useEffect(() => {
    setError(null);
    setFirebaseConfigNeeded(false);
    setIsUnauthorizedDomain(false);
    setOfferRedirectFallback(false);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    const handleRedirectLogin = async () => {
      try {
        const idToken = await consumeGoogleRedirectResult();
        if (!idToken || cancelled) return;
        setBusy(true);
        const res = await api.loginWithGoogle(idToken);
        if (!cancelled) {
          setAuth(res.user, res.access_token, res.refresh_token);
          await hydrateWorkspaceAfterAuth();
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Google Redirect Sign-In failed');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void handleRedirectLogin();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hydrateWorkspaceAfterAuth = async () => {
    const [repoList, vis] = await Promise.all([
      api.listRepos().catch(() => []),
      api.getVisualSettings().catch(() => null),
    ]);
    setRepos(repoList);
    if (vis) setVisualPreferences(vis);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setFirebaseConfigNeeded(false);
    setIsUnauthorizedDomain(false);
    setOfferRedirectFallback(false);

    if (!firebaseReady) {
      setShowFirebaseChecklist(true);
      return;
    }

    setBusy(true);
    try {
      const idToken = await signInWithGooglePopup();
      const res = await api.loginWithGoogle(idToken);
      setAuth(res.user, res.access_token, res.refresh_token);
      await hydrateWorkspaceAfterAuth();
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const code =
        typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';

      if (code === 'auth/configuration-not-found' || rawMsg.includes('auth/configuration-not-found')) {
        setFirebaseConfigNeeded(true);
        setShowFirebaseChecklist(true);
        setError(
          'Google Sign-In is not enabled yet in your Firebase Console (devmindai-2bfd5). Follow the steps in the guide below to enable it, or use Argon2id credentials.'
        );
      } else if (code === 'auth/popup-closed-by-user' || rawMsg.includes('auth/popup-closed-by-user')) {
        setOfferRedirectFallback(true);
        setError('Sign-in popup was closed before completing authentication.');
      } else if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-timeout' ||
        code === 'auth/cancelled-popup-request' ||
        rawMsg.includes('auth/popup-blocked')
      ) {
        setOfferRedirectFallback(true);
        setError(rawMsg || 'Google Sign-In popup could not complete. Try again or use Full-Page Redirect.');
      } else if (code === 'auth/unauthorized-domain' || rawMsg.includes('auth/unauthorized-domain')) {
        setIsUnauthorizedDomain(true);
        setError('Domain 127.0.0.1 is not in your Firebase Authorized Domains list.');
      } else {
        setError(rawMsg || 'Google Sign-In failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleRedirectSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setOfferRedirectFallback(false);
    setBusy(true);
    try {
      await signInWithGoogleRedirect();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to start Google Redirect Sign-In');
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register(email, username, password);
        // Requirement: "when an account is register on argon2 make them sign in again"
        setMode('login');
        setPassword('');
        setSuccessMessage('Account registered successfully with Argon2id! Please sign in with your password to continue.');
        return;
      }

      const res = await api.login(email, password);
      setAuth(res.user, res.access_token, res.refresh_token);
      await hydrateWorkspaceAfterAuth();
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickDevLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const devRes = await api.createDevSession();
      setAuth(devRes.user, devRes.access_token, devRes.refresh_token);
      await hydrateWorkspaceAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev session creation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="unauthenticated-auth-panel"
      className="relative z-20 w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-md my-auto rounded-3xl singularity-auth-glass p-6 sm:p-8 text-xs space-y-5 animate-fade-in">
        {/* Brand Emblem & Welcome Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative w-14 h-14 rounded-full bg-black border border-[#FFB347]/80 shadow-[0_0_35px_rgba(255,179,71,0.55)] flex items-center justify-center mb-1">
            <div className="w-6 h-6 rounded-full bg-black ring-2 ring-[#FFF0D5]/90 animate-pulse" />
            <div
              className="absolute inset-0 rounded-full border border-[#56D9FF]/40 animate-spin"
              style={{ animationDuration: '9s' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base tracking-[0.25em] font-bold text-[#FFF0D5]">DEVMIND AI</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#FFB347]/20 border border-[#FFB347]/50 text-[#FFB347] uppercase tracking-wider">
              SINGULARITY
            </span>
          </div>
          <p className="text-xs text-[#FFF0D5]/70 font-sans">
            Where Intelligence Meets Gravity • Neural Architecture Portal
          </p>
        </div>

        {/* Tab Switcher: Sign In vs. Create Account */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-black/55 border border-white/10">
          <button
            type="button"
            data-testid="auth-tab-login"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-[#56D9FF]/20 border border-[#56D9FF]/55 text-[#56D9FF] shadow-[0_0_16px_rgba(86,217,255,0.25)]'
                : 'text-[#FFF0D5]/65 hover:text-[#FFF0D5] hover:bg-white/[0.04]'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            data-testid="auth-tab-register"
            onClick={() => {
              setMode('register');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'register'
                ? 'bg-[#56D9FF]/20 border border-[#56D9FF]/55 text-[#56D9FF] shadow-[0_0_16px_rgba(86,217,255,0.25)]'
                : 'text-[#FFF0D5]/65 hover:text-[#FFF0D5] hover:bg-white/[0.04]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Primary CTA: Continue with Google */}
        <button
          type="button"
          disabled={busy}
          data-testid="google-signin-btn"
          onClick={handleGoogleSignIn}
          className="w-full py-2.5 px-4 rounded-xl font-semibold bg-white/[0.08] hover:bg-white/[0.14] border border-white/20 hover:border-[#56D9FF]/55 text-[#FFF0D5] flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-[0.99]"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.41-.19-2.08H12z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.75 0 5.06-.91 6.75-2.47l-3.3-2.56c-.91.61-2.08.98-3.45.98-2.65 0-4.9-1.79-5.7-4.2H2.89v2.64A9.99 9.99 0 0 0 12 22z"
            />
            <path
              fill="#4A90E2"
              d="M6.3 13.75A5.99 5.99 0 0 1 5.98 12c0-.61.11-1.2.32-1.75V7.61H2.89A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.08 4.39l3.22-2.64z"
            />
            <path
              fill="#FBBC05"
              d="M12 5.98c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.05 2.94 14.75 2 12 2 8.09 2 4.71 4.24 2.89 7.61l3.41 2.64c.8-2.41 3.05-4.27 5.7-4.27z"
            />
          </svg>
          <span>{busy ? 'Waiting for Google Sign-In...' : 'Continue with Google'}</span>
        </button>

        {showFirebaseChecklist && !firebaseReady && (
          <div
            data-testid="firebase-setup-checklist"
            className="p-3.5 rounded-xl bg-[#101827]/85 border border-[#FFB347]/45 text-[11px] text-[#FFF0D5]/85 space-y-1.5"
          >
            <div className="flex items-center gap-1.5 font-semibold text-[#FFB347]">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Firebase Web Client Keys Needed</span>
            </div>
            <p className="text-[#FFF0D5]/70">
              Add the remaining Firebase Web App identifiers to your local <code className="text-[#56D9FF]">.env</code>:
            </p>
            <ul className="list-disc pl-4 font-mono text-[10px] space-y-0.5">
              {['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'].map(
                (envName) => {
                  const isMissing = missingFirebaseKeys.includes(envName);
                  return (
                    <li key={envName} className={isMissing ? 'text-[#FFB347]' : 'text-emerald-300/90'}>
                      {envName} {isMissing ? '(missing)' : '✓'}
                    </li>
                  );
                }
              )}
            </ul>
          </div>
        )}

        {showFirebaseChecklist && firebaseConfigNeeded && (
          <div
            data-testid="firebase-setup-checklist"
            className="p-3.5 rounded-xl bg-[#101827]/90 border border-[#FFB347]/50 text-[11px] text-[#FFF0D5]/90 space-y-2 shadow-lg"
          >
            <div className="flex items-center gap-1.5 font-semibold text-[#FFB347]">
              <ShieldAlert className="w-4 h-4 shrink-0 text-[#FFB347]" />
              <span>Action Required: Enable Google Provider in Firebase Console</span>
            </div>
            <p className="text-[#FFF0D5]/75 leading-relaxed">
              Your project <code className="text-[#56D9FF] font-mono">devmindai-2bfd5</code> has Firebase keys configured, but the <strong>Google Sign-In Provider</strong> is not yet enabled in the Firebase Console:
            </p>
            <ol className="list-decimal pl-4 space-y-1.5 text-[#FFF0D5]/80">
              <li>
                Open{' '}
                <a
                  href="https://console.firebase.google.com/project/devmindai-2bfd5/authentication/providers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#56D9FF] underline hover:text-[#56D9FF]/80 inline-flex items-center gap-1 font-semibold"
                >
                  Firebase Console &rarr; Authentication &rarr; Sign-in method
                </a>.
              </li>
              <li>Click <strong>Google</strong> under <em>Sign-in providers</em> and toggle <strong>Enable</strong> to <strong>ON</strong>.</li>
              <li>Select support email and click <strong>Save</strong>.</li>
            </ol>
            <div className="pt-1 flex items-center justify-between gap-2">
              <a
                href="https://console.firebase.google.com/project/devmindai-2bfd5/authentication/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/40 text-[#FFF0D5] font-medium text-[11px]"
              >
                Open Firebase Sign-in Console &rarr;
              </a>
              <button
                type="button"
                onClick={() => setShowFirebaseChecklist(false)}
                className="text-[10px] text-[#FFF0D5]/50 hover:text-[#FFF0D5]/80 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#FFF0D5]/40 font-mono">
          <div className="flex-1 h-px bg-white/10" />
          <span>or Argon2id Credentials</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[#FFF0D5]/85 mb-1 font-medium">Email Address</label>
            <GlassInput
              data-testid="auth-email-input"
              type="email"
              autoComplete="email"
              placeholder="architect@yourdomain.com"
              containerClassName="bg-[#050914]/75 border-white/25"
              className="placeholder-[#FFF0D5]/50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[#FFF0D5]/85 mb-1 font-medium">Display Name / Username</label>
              <GlassInput
                data-testid="auth-username-input"
                autoComplete="name"
                placeholder="Singularity Architect"
                containerClassName="bg-[#050914]/75 border-white/25"
                className="placeholder-[#FFF0D5]/50"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[#FFF0D5]/85 mb-1 font-medium">
              Password {mode === 'register' && <span className="text-[#FFF0D5]/55">(min 10 chars)</span>}
            </label>
            <GlassInput
              data-testid="auth-password-input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••••••"
              containerClassName="bg-[#050914]/75 border-white/25"
              className="placeholder-[#FFF0D5]/50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === 'register' ? 10 : 1}
              required
            />
          </div>

          {successMessage && (
            <div
              data-testid="auth-success-alert"
              className="p-3 rounded-lg bg-[#07261A]/90 border border-emerald-400/50 text-emerald-200 font-medium flex items-center gap-2"
            >
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div
              data-testid="auth-error-alert"
              className="p-3 rounded-lg bg-[#221008]/92 border border-[#FF7838]/60 text-[#FFD8B0] space-y-2 text-[11px]"
            >
              <div className="flex items-center gap-1.5 font-semibold text-[#FFF0D5]">
                <ShieldAlert className="w-4 h-4 shrink-0 text-[#FFB347]" />
                <span>{error}</span>
              </div>

              {offerRedirectFallback && (
                <div className="pt-1.5 border-t border-[#FF7838]/30 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[#FFF0D5]/75">Popups blocked or taking too long?</span>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="google-redirect-fallback-btn"
                    onClick={handleGoogleRedirectSignIn}
                    className="px-3 py-1.5 rounded-lg bg-[#56D9FF]/22 hover:bg-[#56D9FF]/32 border border-[#56D9FF]/55 text-[#FFF0D5] font-semibold text-[11px]"
                  >
                    Use Full-Page Google Redirect &rarr;
                  </button>
                </div>
              )}

              {isUnauthorizedDomain && (
                <div className="pt-2 border-t border-[#FF7838]/30 space-y-2">
                  <p className="text-[#FFF0D5]/80 leading-relaxed">
                    Firebase permits <code className="text-[#56D9FF] font-mono">localhost</code> by default, but treats <code className="text-[#56D9FF] font-mono">127.0.0.1</code> as a separate domain.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && (
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = window.location.href.replace('127.0.0.1', 'localhost');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/45 text-[#FFF0D5] font-medium text-[11px]"
                      >
                        Switch URL to localhost:5173 &rarr;
                      </button>
                    )}
                    <a
                      href="https://console.firebase.google.com/project/devmindai-2bfd5/authentication/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-[#FFF0D5]/90 text-[11px] inline-flex items-center"
                    >
                      Add 127.0.0.1 to Authorized Domains &rarr;
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            data-testid="auth-submit-btn"
            className="w-full py-2.5 rounded-xl font-semibold bg-[#0B2A42]/92 hover:bg-[#103A5C] border border-[#56D9FF]/75 text-white shadow-[0_0_24px_rgba(86,217,255,0.24)] active:scale-[0.99] transition-all"
          >
            {busy ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Bottom Toggle Text */}
        <div className="pt-2 text-center text-[#FFF0D5]/65">
          {mode === 'login' ? (
            <p>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="text-[#56D9FF] hover:underline font-semibold"
              >
                Create Account &rarr;
              </button>
            </p>
          ) : (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="text-[#56D9FF] hover:underline font-semibold"
              >
                Sign In to existing account &rarr;
              </button>
            </p>
          )}
        </div>

        {/* Development Quick Sandbox Access (only visible in local dev mode) */}
        {import.meta.env.DEV && (
          <div className="pt-3 border-t border-white/10 text-center">
            <button
              type="button"
              disabled={busy}
              data-testid="dev-quick-login-btn"
              onClick={handleQuickDevLogin}
              className="text-[11px] font-mono text-[#FFB347]/85 hover:text-[#FFB347] hover:underline inline-flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FFB347]" />
              <span>⚡ Quick Sandbox Access (Local Dev Only)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
