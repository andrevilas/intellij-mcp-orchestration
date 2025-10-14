export interface ProviderSummary {
  id: string;
  name: string;
  command: string;
  description?: string;
  tags: string[];
  capabilities: string[];
  transport: string;
  is_available?: boolean;
}

export interface Session {
  id: string;
  provider_id: string;
  created_at: string;
  status: string;
  reason?: string | null;
  client?: string | null;
}

export interface ProvidersResponse {
  providers: ProviderSummary[];
}

export interface SessionResponse {
  session: Session;
  provider: ProviderSummary;
}

export interface SessionsResponse {
  sessions: Session[];
}

export interface SessionCreatePayload {
  reason?: string;
  client?: string;
}

const DEFAULT_API_BASE = '/api/v1';
const API_BASE = (import.meta.env.VITE_CONSOLE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchProviders(signal?: AbortSignal): Promise<ProviderSummary[]> {
  const data = await request<ProvidersResponse>('/providers', { signal });
  return data.providers;
}

export async function fetchSessions(signal?: AbortSignal): Promise<Session[]> {
  const data = await request<SessionsResponse>('/sessions', { signal });
  return data.sessions;
}

export async function createSession(
  providerId: string,
  payload: SessionCreatePayload = {},
  signal?: AbortSignal,
): Promise<SessionResponse> {
  return request<SessionResponse>(`/providers/${providerId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export const apiBase = API_BASE;
