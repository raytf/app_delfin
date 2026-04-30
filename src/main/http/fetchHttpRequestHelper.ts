import type { AnyObj } from "../../shared/types";
import {
  HttpRequestHelper,
  type HttpRequestOptions,
} from "./httpRequestHelper";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function appendParams(url: URL, params: AnyObj | undefined): void {
  if (params === undefined) {
    return;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    url.searchParams.append(key, String(value));
  }
}

function normalizeHeaders(
  headers: AnyObj | undefined,
): HeadersInit | undefined {
  if (headers === undefined) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = String(value);
  }

  return normalized;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (text.trim().length === 0) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export class FetchHttpRequestHelper extends HttpRequestHelper {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  async get<T>(urlSuffix: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("GET", urlSuffix, undefined, options);
  }

  async post<T>(
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T> {
    return this.request<T>("POST", urlSuffix, data, options);
  }

  async put<T>(
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T> {
    return this.request<T>("PUT", urlSuffix, data, options);
  }

  async delete<T>(urlSuffix: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("DELETE", urlSuffix, undefined, options);
  }

  async patch<T>(
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T> {
    return this.request<T>("PATCH", urlSuffix, data, options);
  }

  private async request<T>(
    method: string,
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T> {
    const url = new URL(urlSuffix, normalizeBaseUrl(this.baseUrl));
    appendParams(url, options?.params);

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(normalizeHeaders(options?.headers) ?? {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });

    if (!response.ok) {
      const payloadText = await response.text();
      let errorMessage = `Request failed with status ${response.status}`;

      if (payloadText.trim().length > 0) {
        try {
          const payload = JSON.parse(payloadText) as {
            error?: { displayMessage?: string | null };
          };
          errorMessage =
            payload.error?.displayMessage ??
            `Request failed with status ${response.status}`;
        } catch {
          errorMessage = `Request failed with status ${response.status}`;
        }
      }

      throw new Error(errorMessage);
    }

    return parseJsonResponse<T>(response);
  }
}
