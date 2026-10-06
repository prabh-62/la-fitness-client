/** Public domain types returned by the client (clean, camelCase, Temporal dates). */

export interface Credentials {
  /** LA Fitness username or email. */
  username: string;
  /** LA Fitness password. Required for every private call (sent as Basic auth). */
  password: string;
}

/** A single gym check-in. */
export interface CheckIn {
  /** LA Fitness `CheckLogID` — stable unique id for the check-in. */
  id: number;
  /** Numeric club id (e.g. 1141). */
  clubId: number;
  /**
   * Wall-clock time at the club. The API gives no time zone, so this is a
   * `PlainDateTime`; use `.toZonedDateTime(tz)` if you know the club's zone.
   */
  checkedInAt: Temporal.PlainDateTime;
}

/** One label/value row of the account profile, e.g. `{ label: "Home Club", value: "…" }`. */
export interface AccountProfileItem {
  label: string;
  value: string;
}

/** A titled group of rows, e.g. "Account Information" or "Billing Information". */
export interface AccountProfileSection {
  title: string;
  items: AccountProfileItem[];
}

/** The member's account profile, as the app's profile screen shows it. */
export interface AccountProfile {
  sections: AccountProfileSection[];
}

/** A serializable session snapshot — lets you skip the slow register+login next run. */
export interface SessionSnapshot {
  deviceId: string;
  /** Auth token from a successful login. */
  token: string;
  /** ISO instant (`Temporal.Instant` string) after which the token should be treated as expired. */
  expiresAt: string;
}

export interface CheckinHistoryRange {
  /** Inclusive start: a `Temporal.PlainDate`, or an ISO date string like `"2026-01-01"`. */
  startDate: Temporal.PlainDateLike;
  /** Inclusive end: e.g. `Temporal.Now.plainDateISO()` for today. */
  endDate: Temporal.PlainDateLike;
}

/** Options for constructing a client. */
export interface LAFitnessClientOptions {
  credentials: Credentials;
  /**
   * Resume a previous session (from `client.exportSession()`) to skip
   * device registration + login while the token is still valid.
   */
  session?: SessionSnapshot;
  /**
   * Reuse a specific device id. Defaults to the session's id, or a random one.
   * A device must be registered once (the client does this automatically).
   */
  deviceId?: string;
  /** Override the API base URL (trailing slash required). */
  baseUrl?: string;
  /** Custom fetch implementation (defaults to global `fetch`). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Default 45000. */
  timeoutMs?: number;
  /**
   * UTC offset string sent to the API, e.g. "-04:00".
   * Defaults to the host machine's current offset.
   */
  timezoneOffset?: string;
}
