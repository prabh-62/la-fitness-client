/** Base error for all failures originating from this client. */
export class LAFitnessError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Credentials are missing, or the server rejected them at login. */
export class AuthError extends LAFitnessError {}

export interface ApiErrorOptions extends ErrorOptions {
  status?: number | undefined;
  reason?: string | undefined;
}

/**
 * The API call failed: a network error, a non-2xx response (e.g. the
 * "device not registered" 401), `Success: false`, or a response that didn't
 * match the expected schema (the `ZodError` is on `cause`).
 */
export class ApiError extends LAFitnessError {
  /** HTTP status, when a response was received. */
  readonly status: number | undefined;
  /** The `reason` response header, e.g. `"device"`. */
  readonly reason: string | undefined;

  constructor(message: string, { status, reason, ...options }: ApiErrorOptions = {}) {
    super(message, options);
    this.status = status;
    this.reason = reason;
  }
}

/** The request did not complete within `timeoutMs`. */
export class TimeoutError extends LAFitnessError {}

/** `exportSession()` was called before any successful login. */
export class NotAuthenticatedError extends LAFitnessError {
  constructor() {
    super("Not authenticated — call login() (or pass a valid session) first.");
  }
}
