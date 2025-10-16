const DEFAULT_API_BASE = '/api/v1';
const DEFAULT_AGENTS_BASE = '/agents';

const API_BASE_URL = (import.meta.env.VITE_CONSOLE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '');
const AGENTS_BASE_URL = (import.meta.env.VITE_CONSOLE_AGENTS_BASE ?? DEFAULT_AGENTS_BASE).replace(/\/$/, '');
const API_KEY = (import.meta.env.VITE_CONSOLE_API_KEY ?? '').trim();

function normalizePath(base: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function buildHeaders(init?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};

  if (init instanceof Headers) {
    init.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(init)) {
    for (const [key, value] of init) {
      headers[key] = value;
    }
  } else if (init) {
    Object.assign(headers, init);
  }

  const contentTypeKey = 'Content-Type' in headers ? 'Content-Type' : 'content-type' in headers ? 'content-type' : null;
  if (contentTypeKey) {
    const value = headers[contentTypeKey];
    delete headers[contentTypeKey];
    headers['Content-Type'] = value;
  } else {
    headers['Content-Type'] = 'application/json';
  }

  const apiKeyKey = 'X-API-Key' in headers ? 'X-API-Key' : 'x-api-key' in headers ? 'x-api-key' : null;
  if (API_KEY) {
    if (apiKeyKey) {
      const value = headers[apiKeyKey];
      delete headers[apiKeyKey];
      headers['X-API-Key'] = value;
    } else {
      headers['X-API-Key'] = API_KEY;
    }
  }

  return headers;
}

function mergeRequestInit(init?: RequestInit): RequestInit {
  if (!init) {
    return { method: 'GET', headers: buildHeaders() };
  }
  const headers = buildHeaders(init.headers ?? undefined);
  return {
    ...init,
    method: init.method ?? 'GET',
    headers,
  };
}

export async function fetchFromApi(path: string, init?: RequestInit): Promise<Response> {
  const url = normalizePath(API_BASE_URL, path);
  return fetch(url, mergeRequestInit(init));
}

export async function fetchFromAgents(path: string, init?: RequestInit): Promise<Response> {
  const url = normalizePath(AGENTS_BASE_URL, path);
  return fetch(url, mergeRequestInit(init));
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getAgentsBaseUrl(): string {
  return AGENTS_BASE_URL;
}

export { DEFAULT_API_BASE, DEFAULT_AGENTS_BASE };
