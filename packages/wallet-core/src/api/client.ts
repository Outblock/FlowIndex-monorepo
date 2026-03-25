export interface ApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

let clientOptions: ApiClientOptions = {
  baseUrl: '',
};

export function configureApiClient(options: ApiClientOptions) {
  clientOptions = { ...clientOptions, ...options };
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${clientOptions.baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...clientOptions.headers,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}
