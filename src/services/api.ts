import { UserProfile, useSingularityStore } from '../store/singularityStore';
import { VisualPreferences } from '../engine/cosmicEngine';

const API_BASE = '/api';

export interface AuthSessionResponse {
  access_token: string;
  refresh_token: string;
  is_new_user?: boolean;
  user: UserProfile;
}

let activeRefreshPromise: Promise<boolean> | null = null;
let activeDevSessionPromise: Promise<AuthSessionResponse> | null = null;

function createDevSessionDeduplicated(): Promise<AuthSessionResponse> {
  if (activeDevSessionPromise) return activeDevSessionPromise;
  activeDevSessionPromise = request<AuthSessionResponse>('/auth/dev-session', { method: 'POST' }, false).finally(
    () => {
      activeDevSessionPromise = null;
    }
  );
  return activeDevSessionPromise;
}

async function tryHealDevWorkstationSession(): Promise<boolean> {
  const isAutoAuth =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('auto_auth') === '1';
  const canAutoHealDev =
    import.meta.env.DEV &&
    isAutoAuth &&
    window.sessionStorage?.getItem('devmind_logged_out') !== '1';
  if (!canAutoHealDev) return false;

  try {
    const devRes = await createDevSessionDeduplicated();
    useSingularityStore.getState().setAuth(devRes.user, devRes.access_token, devRes.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function attemptSilentRefresh(): Promise<boolean> {
  if (activeRefreshPromise) return activeRefreshPromise;

  const { refreshToken, setAuth, clearAuth, setAuthModalOpen } = useSingularityStore.getState();
  if (!refreshToken) {
    return tryHealDevWorkstationSession();
  }

  activeRefreshPromise = (async () => {
    try {
      const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!resp.ok) {
        clearAuth();
        const healed = await tryHealDevWorkstationSession();
        if (healed) return true;
        if (typeof window !== 'undefined') {
          setAuthModalOpen(true);
        }
        return false;
      }
      const data = (await resp.json()) as AuthSessionResponse;
      setAuth(data.user, data.access_token, data.refresh_token);
      return true;
    } catch {
      clearAuth();
      const healed = await tryHealDevWorkstationSession();
      if (healed) return true;
      if (typeof window !== 'undefined') {
        setAuthModalOpen(true);
      }
      return false;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const { token } = useSingularityStore.getState();
  const headers = new Headers(init.headers || {});

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    allowRefresh &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/google') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await attemptSilentRefresh();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (typeof errBody?.detail === 'string') {
        detail = errBody.detail;
      } else if (Array.isArray(errBody?.detail) && errBody.detail[0]?.msg) {
        detail = errBody.detail[0].msg;
      }
    } catch {
      // ignore json parse failure
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealth: () =>
    request<{
      status: string;
      version: string;
      environment: string;
      database_mode: string;
      gemini_configured: boolean;
      gemini_model: string;
      firebase_configured: boolean;
    }>('/health'),

  loginWithGoogle: (idToken: string) =>
    request<AuthSessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    }),

  login: (email: string, password: string) =>
    request<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, username: string, password: string) =>
    request<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),

  refreshSession: (refreshToken: string) =>
    request<AuthSessionResponse>(
      '/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      false
    ),

  logoutSession: () =>
    request<{ logged_out: boolean }>('/auth/logout', { method: 'POST' }, false),

  createDevSession: () => createDevSessionDeduplicated(),

  getMe: () => request<UserProfile>('/auth/me'),

  updateProfile: (payload: { display_name?: string; photo_url?: string | null }) =>
    request<UserProfile>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteAccount: () => request<{ deleted: boolean }>('/auth/me', { method: 'DELETE' }),

  adminListUsers: () => request<UserProfile[]>('/admin/users'),

  adminUpdateUserStatus: (
    userId: number,
    payload: { account_status?: 'active' | 'disabled'; role?: 'user' | 'admin' }
  ) =>
    request<UserProfile>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  adminListAuditLogs: () =>
    request<
      Array<{
        id: number;
        request_id: string;
        user_id: number | null;
        event_type: string;
        ip_address: string;
        target_resource: string;
        status: string;
        details: Record<string, unknown>;
        created_at: string;
      }>
    >('/admin/audit-logs'),

  getVisualSettings: () => request<VisualPreferences>('/settings/visual'),

  saveVisualSettings: (prefs: VisualPreferences) =>
    request<VisualPreferences>('/settings/visual', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),

  listRepos: () =>
    request<
      Array<{
        id: number;
        name: string;
        description: string;
        languages: Record<string, number>;
        file_count: number;
        symbol_count: number;
        chunk_count: number;
        status: string;
        created_at: string;
      }>
    >('/repos'),

  provisionStarterRepo: () =>
    request<{ id: number; name: string; file_count: number; symbol_count: number; chunk_count: number }>(
      '/repos/starter',
      { method: 'POST' }
    ),

  createRepo: (name: string, description: string, files: Array<{ path: string; content: string }>) =>
    request<{ id: number; name: string; file_count: number; symbol_count: number; chunk_count: number }>(
      '/repos/create',
      {
        method: 'POST',
        body: JSON.stringify({ name, description, files }),
      }
    ),

  uploadRepoZip: (name: string, description: string, file: File) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', description);
    fd.append('file', file);
    return request<{ id: number; name: string; file_count: number; symbol_count: number }>(
      '/repos/upload-zip',
      {
        method: 'POST',
        body: fd,
      }
    );
  },

  getRepoFiles: (repoId: number) =>
    request<
      Array<{
        id: number;
        path: string;
        language: string;
        loc: number;
        complexity: number;
        symbols: Array<{ name: string; kind: string; line: number; end_line: number }>;
        imports: string[];
        content: string;
      }>
    >(`/repos/${repoId}/files`),

  deleteRepo: (repoId: number) => request<{ deleted: boolean }>(`/repos/${repoId}`, { method: 'DELETE' }),

  getChatHistory: (repoId?: number | null) =>
    request<
      Array<{
        id: number;
        role: 'user' | 'assistant';
        content: string;
        citations: Array<{ file_path: string; start_line: number; end_line: number; symbol: string; score: number }>;
        shield_status: string;
        latency_ms: number;
        model_used: string;
        created_at: string;
      }>
    >(`/chat/history${repoId ? `?repo_id=${repoId}` : ''}`),

  sendChatMessage: (message: string, repoId?: number | null, simulateError = false) =>
    request<{
      user_message: { id: number; role: 'user'; content: string; shield_status: string };
      assistant_message: {
        id: number;
        role: 'assistant';
        content: string;
        citations: Array<{ file_path: string; start_line: number; end_line: number; symbol: string; score: number }>;
        shield_status: string;
        latency_ms: number;
        model_used: string;
        created_at: string;
      };
    }>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ message, repo_id: repoId ?? null, simulate_error: simulateError }),
    }),

  clearChat: (repoId?: number | null) =>
    request<{ cleared: boolean }>(`/chat/clear${repoId ? `?repo_id=${repoId}` : ''}`, { method: 'DELETE' }),

  getArchitecture: (repoId: number) =>
    request<{
      repo_id: number;
      repo_name: string;
      nodes: Array<{
        id: string;
        label: string;
        path: string;
        language: string;
        layer: string;
        loc: number;
        complexity: number;
        symbol_count: number;
        symbols: Array<{ name: string; kind: string; line: number }>;
      }>;
      edges: Array<{ source: string; target: string; relation: string }>;
      metrics: {
        module_count: number;
        dependency_edges: number;
        average_complexity: number;
        coupling_index: number;
      };
    }>(`/architecture/${repoId}`),

  analyzeCodeReview: (payload: { repo_id?: number | null; file_path: string; code?: string }) =>
    request<{
      file_path: string;
      language: string;
      quality_score: number;
      summary: string;
      findings: Array<{
        severity: string;
        category: string;
        line: number;
        title: string;
        suggestion: string;
      }>;
      latency_ms: number;
      model_used: string;
    }>('/review/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  scanPromptShield: (prompt: string, repoId?: number | null) =>
    request<{
      risk_score: number;
      verdict: string;
      findings: Array<{ rule_id: string; title: string; severity: string; matched: string; remediation: string }>;
      sanitized_prompt: string;
    }>('/security/prompt-shield', {
      method: 'POST',
      body: JSON.stringify({ prompt, repo_id: repoId ?? null }),
    }),

  auditRepositorySecurity: (repoId: number) =>
    request<{
      risk_score: number;
      security_posture_score: number;
      verdict: string;
      finding_count: number;
      findings: Array<{
        rule_id: string;
        title: string;
        severity: string;
        file_path: string;
        line: number;
        snippet: string;
        advice: string;
      }>;
    }>(`/security/repo-audit/${repoId}`),

  getSecurityHistory: () =>
    request<
      Array<{
        id: number;
        scan_type: string;
        input_excerpt: string;
        risk_score: number;
        verdict: string;
        findings: Array<{ rule_id: string; title: string; severity: string }>;
        created_at: string;
      }>
    >('/security/history'),

  getModelDoctorStatus: () =>
    request<{
      active_model: string;
      gemini_live_key_detected: boolean;
      vector_backend: string;
      average_latency_ms: number;
      total_tokens_processed: number;
      system_health_score: number;
      telemetry: Array<{
        id: number;
        operation: string;
        model_name: string;
        latency_ms: number;
        prompt_tokens: number;
        completion_tokens: number;
        status: string;
        health_score: number;
        notes: string;
        created_at: string;
      }>;
    }>('/model-doctor/status'),

  runModelDoctorDiagnosis: (samplePrompt: string, temperature: number) =>
    request<{
      clarity_score: number;
      hallucination_risk: string;
      measured_latency_ms: number;
      model_used: string;
      recommendations: string[];
      probe_output_preview: string;
    }>('/model-doctor/diagnose', {
      method: 'POST',
      body: JSON.stringify({ sample_prompt: samplePrompt, temperature }),
    }),

  listMemories: () =>
    request<
      Array<{
        id: number;
        title: string;
        content: string;
        category: string;
        tags: string[];
        importance: number;
        links: string[];
        created_at: string;
      }>
    >('/memory-mesh'),

  createMemory: (payload: {
    title: string;
    content: string;
    category: string;
    tags: string[];
    importance: number;
    repo_id?: number | null;
  }) =>
    request<{
      id: number;
      title: string;
      content: string;
      category: string;
      tags: string[];
      importance: number;
      links: string[];
      created_at: string;
    }>('/memory-mesh', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchMemories: (q: string) =>
    request<
      Array<{
        id: number;
        title: string;
        content: string;
        category: string;
        tags: string[];
        importance: number;
        score: number;
      }>
    >(`/memory-mesh/search?q=${encodeURIComponent(q)}`),

  deleteMemory: (id: number) => request<{ deleted: boolean }>(`/memory-mesh/${id}`, { method: 'DELETE' }),

  generateDocs: (repoId: number, docType: string) =>
    request<{
      id: number;
      repo_id: number;
      doc_type: string;
      title: string;
      markdown_content: string;
      latency_ms: number;
      model_used: string;
      created_at: string;
    }>('/docs-gen/generate', {
      method: 'POST',
      body: JSON.stringify({ repo_id: repoId, doc_type: docType }),
    }),

  listGeneratedDocs: (repoId: number) =>
    request<
      Array<{
        id: number;
        doc_type: string;
        title: string;
        markdown_content: string;
        created_at: string;
      }>
    >(`/docs-gen/${repoId}`),
};
