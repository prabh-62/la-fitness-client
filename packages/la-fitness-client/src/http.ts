import { z } from "zod";
import { ApiError, TimeoutError } from "./errors.ts";
import { Envelope } from "./schemas.ts";

/** App/device identity sent as `request.Client` on every call. */
export interface DeviceClientInfo {
  Version: string;
  Platform: string;
  Model: string;
  OSName: string;
  OSVersion: string;
  DeviceID: string;
  TimezoneOffset: string;
  BrandID: number;
  VariantId: number;
}

export interface TransportOptions {
  baseUrl: string;
  client: DeviceClientInfo;
  fetch: typeof fetch;
  timeoutMs: number;
}

/** Headers for private calls: the login token plus a precomputed Basic auth value. */
export interface PrivateAuth {
  token: string;
  authorization: string;
}

/**
 * Low-level transport: wraps a value in the API's `{ request: { Client, Value } }`
 * envelope, POSTs it, unwraps `{ Success, Message, Value }`, validates `Value`
 * against `schema`, and normalizes every failure into an `LAFitnessError`.
 */
export class Transport {
  readonly #opts: TransportOptions;

  constructor(opts: TransportOptions) {
    this.#opts = opts;
  }

  async post<S extends z.ZodType>(
    path: string,
    schema: S,
    value?: unknown,
    auth?: PrivateAuth,
  ): Promise<z.output<S>> {
    const { baseUrl, client, fetch, timeoutMs } = this.#opts;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      DeviceID: client.DeviceID,
    };
    if (auth) {
      headers["AuthToken"] = auth.token;
      headers["Authorization"] = auth.authorization;
    }

    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    let json: unknown;
    try {
      res = await fetch(baseUrl + path, {
        method: "POST",
        headers,
        body: JSON.stringify({ request: { Client: client, Value: value } }),
        signal,
      });
      if (!res.ok) {
        // The "device not registered" rejection comes back as 401 with a `reason: device` header.
        throw new ApiError(`${path} failed with HTTP ${res.status}`, {
          status: res.status,
          reason: res.headers.get("reason") ?? undefined,
        });
      }
      json = await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (signal.aborted) {
        throw new TimeoutError(`${path} timed out after ${timeoutMs}ms`, { cause: err });
      }
      throw new ApiError(`${path} failed: ${String(err)}`, { cause: err });
    }

    const env = Envelope.safeParse(json);
    if (!env.success) {
      throw new ApiError(`${path} returned an unexpected envelope`, {
        status: res.status,
        cause: env.error,
      });
    }
    if (!env.data.Success) {
      throw new ApiError(`${path} failed: ${env.data.Message || "unknown error"}`, {
        status: res.status,
      });
    }
    const parsed = schema.safeParse(env.data.Value);
    if (!parsed.success) {
      throw new ApiError(`${path} returned an unexpected Value: ${z.prettifyError(parsed.error)}`, {
        status: res.status,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }
}

/** `Authorization` header value for HTTP Basic auth (UTF-8 safe). */
export function basicAuth(username: string, password: string): string {
  return `Basic ${new TextEncoder().encode(`${username}:${password}`).toBase64()}`;
}
