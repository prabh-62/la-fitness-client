import { z } from "zod";
import { ApiError, AuthError, NotAuthenticatedError } from "./errors.ts";
import { basicAuth, Transport, type PrivateAuth } from "./http.ts";
import { AccountProfileResponse, AuthTokenResponse, CheckinHistoryResponse } from "./schemas.ts";
import type {
  AccountProfile,
  CheckIn,
  CheckinHistoryRange,
  LAFitnessClientOptions,
  SessionSnapshot,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://publicapi.lafitness.com/LAF_S4.7.15/Services/";
const DEFAULT_TIMEOUT_MS = 45_000;
/** Tokens last ~1h server-side; treat as expired a little early to be safe. */
const TOKEN_TTL = Temporal.Duration.from({ minutes: 50 });

/** App identity values, read from the official client. */
const APP = {
  Version: "LAF_1.267",
  Platform: "Android",
  Model: "Pixel 7",
  OSName: "Android",
  OSVersion: "34",
  BrandID: 1,
  VariantId: 836,
} as const;

/**
 * Ergonomic, typed client for the LA Fitness mobile API.
 *
 * ```ts
 * const laf = new LAFitnessClient({ credentials: { username, password } });
 * const checkins = await laf.getCheckinHistory({
 *   startDate: "2026-01-01",
 *   endDate: Temporal.Now.plainDateISO(),
 * });
 * ```
 *
 * Every private call carries both the login token and HTTP Basic auth, so the
 * password is held in memory for the lifetime of the client. `exportSession()`
 * returns a token snapshot (no password) you can persist to skip the slow
 * register+login step next run.
 */
export class LAFitnessClient {
  /** The device id in use (persist it to reuse a registered device). */
  readonly deviceId: string;
  readonly #transport: Transport;
  readonly #username: string;
  readonly #password: string;
  #token: string | undefined;
  #tokenExpiresAt: Temporal.Instant | undefined;

  constructor(options: LAFitnessClientOptions) {
    const { username, password } = options.credentials ?? {};
    if (!username || !password) {
      throw new AuthError("credentials.username and credentials.password are required.");
    }
    this.#username = username;
    this.#password = password;
    this.deviceId = options.deviceId ?? options.session?.deviceId ?? randomHex(8);
    this.#transport = new Transport({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      client: {
        ...APP,
        DeviceID: this.deviceId,
        TimezoneOffset: options.timezoneOffset ?? Temporal.Now.zonedDateTimeISO().offset,
      },
      fetch: options.fetch ?? globalThis.fetch,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (options.session) {
      this.#token = options.session.token;
      this.#tokenExpiresAt = Temporal.Instant.from(options.session.expiresAt);
    }
  }

  /** True when a non-expired token is held. */
  get isAuthenticated(): boolean {
    return (
      this.#token !== undefined &&
      this.#tokenExpiresAt !== undefined &&
      Temporal.Instant.compare(this.#tokenExpiresAt, Temporal.Now.instant()) > 0
    );
  }

  /**
   * Register the device (if needed) and authenticate. Idempotent: returns
   * immediately if a valid token is already held. Returns a session snapshot.
   * Optional — data methods call it automatically.
   */
  async login(): Promise<SessionSnapshot> {
    if (this.isAuthenticated) return this.exportSession();
    try {
      await this.#authenticate();
    } catch (err) {
      // First-time device ids are rejected with 401 `reason: device` until registered.
      if (!(err instanceof ApiError && err.status === 401 && err.reason === "device")) throw err;
      await this.#registerDevice();
      await this.#authenticate();
    }
    return this.exportSession();
  }

  /** Gym check-in history for an inclusive date range, oldest first, in a single request. */
  async getCheckinHistory({ startDate, endDate }: CheckinHistoryRange): Promise<CheckIn[]> {
    return this.#privatePost("Private.svc/GetCheckinHistory", CheckinHistoryResponse, {
      FromDate: toApiDate(startDate),
      ToDate: toApiDate(endDate),
    });
  }

  /** The member's account profile, grouped into the sections the app displays. */
  async getAccountProfile(): Promise<AccountProfile> {
    return this.#privatePost("Private.svc/GetAccountProfile", AccountProfileResponse);
  }

  /** A persistable session (token + device id, no password). */
  exportSession(): SessionSnapshot {
    if (this.#token === undefined || this.#tokenExpiresAt === undefined) {
      throw new NotAuthenticatedError();
    }
    return {
      deviceId: this.deviceId,
      token: this.#token,
      expiresAt: this.#tokenExpiresAt.toString(),
    };
  }

  async #authenticate(): Promise<void> {
    try {
      this.#token = await this.#transport.post(
        "public.svc/AuthenticateAccount",
        AuthTokenResponse,
        { Username: this.#username, Password: this.#password },
      );
    } catch (err) {
      // A 200 with `Success: false` is the server rejecting the credentials.
      if (err instanceof ApiError && err.status === 200) {
        throw new AuthError(err.message, { cause: err });
      }
      throw err;
    }
    this.#tokenExpiresAt = Temporal.Now.instant().add(TOKEN_TTL);
  }

  async #registerDevice(): Promise<void> {
    await this.#transport.post("Public.svc/SaveUserPushSettings", z.unknown(), {
      AppID: 1,
      CustomerID: 0,
      DeviceID: this.deviceId,
      DeviceToken: "d" + randomHex(70),
      PushOptInFlag: false,
    });
  }

  async #privatePost<S extends z.ZodType>(
    path: string,
    schema: S,
    value?: unknown,
  ): Promise<z.output<S>> {
    // Credentials are always held, so (re-)login transparently on a missing or expired token.
    if (!this.isAuthenticated) await this.login();
    const auth: PrivateAuth = {
      token: this.#token!,
      // Required alongside the token. Without it the server doesn't reject the
      // request — it hangs until the client times out.
      authorization: basicAuth(this.#username, this.#password),
    };
    return this.#transport.post(path, schema, value, auth);
  }
}

/** `M/D/YY`, the date format the mobile app sends. */
function toApiDate(input: Temporal.PlainDateLike): string {
  const { month, day, year } = Temporal.PlainDate.from(input);
  return `${month}/${day}/${String(year % 100).padStart(2, "0")}`;
}

function randomHex(bytes: number): string {
  return crypto.getRandomValues(new Uint8Array(bytes)).toHex();
}
