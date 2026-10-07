export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type ApiOptions = RequestInit & {
  skipRefresh?: boolean;
};

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = api<{ data: { accessToken: string } }>("/api/v1/auth/refresh", {
      method: "POST",
      skipRefresh: true,
    })
      .then((result) => {
        setAccessToken(result.data.accessToken);
        return true;
      })
      .catch(() => {
        setAccessToken(null);
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipRefresh = false, headers, body, ...rest } = options;

  const response = await fetch(path, {
    ...rest,
    body,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (
    response.status === 401 &&
    !skipRefresh &&
    !path.endsWith("/auth/login") &&
    !path.endsWith("/auth/refresh")
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return api<T>(path, { ...options, skipRefresh: true });
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.code ?? "REQUEST_FAILED",
      response.status,
      payload?.error?.message ?? "Request failed",
    );
  }

  return payload as T;
}
