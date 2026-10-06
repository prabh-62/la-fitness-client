# la-fitness-client

An ergonomic, typed TypeScript client for the LA Fitness mobile API. It signs in,
transparently registers a device, and returns your **check-in history** and basic
**account** info as clean domain objects (`Temporal` dates, `camelCase`, no envelope noise).

> Unofficial. Built against the mobile app's endpoints for personal use with **your
> own** account. LA Fitness can change or block these at any time. Not affiliated
> with or endorsed by LA Fitness.

## Install

```bash
pnpm add la-fitness-client
```

Runtime: **Node ≥ 26** (uses the built-in `fetch`, Web Crypto, and `Temporal`). One runtime dependency:
[zod](https://zod.dev), used to validate every API response.
ESM only.

> **Browser note:** this talks to `publicapi.lafitness.com`, which does not send
> CORS headers, so it won't run from a web page directly — use it from Node, a
> server, or a browser extension.

## Quick start

```ts
import { LAFitnessClient } from "la-fitness-client";

const laf = new LAFitnessClient({
  credentials: { username: process.env.LAF_USERNAME!, password: process.env.LAF_PASSWORD! },
});

const checkins = await laf.getCheckinHistory({
  startDate: "2022-05-01", // Temporal.PlainDate or ISO date string
  endDate: Temporal.Now.plainDateISO(),
});

for (const c of checkins) {
  console.log(c.checkedInAt.toLocaleString(), "· club", c.clubId);
}
```

## API

### `new LAFitnessClient(options)`

| Option                                            | Type                     | Notes                                                                                                                          |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `credentials`                                     | `{ username, password }` | **Required.** The password is sent as HTTP Basic auth on every private call, so it's held in memory for the client's lifetime. |
| `session`                                         | `SessionSnapshot`        | Resume a prior session (from `exportSession()`) to skip register+login.                                                        |
| `deviceId`                                        | `string`                 | Reuse a registered device id. Defaults to the session's, else random.                                                          |
| `baseUrl`, `fetch`, `timeoutMs`, `timezoneOffset` |                          | Overrides for testing / custom transport.                                                                                      |

### `login(): Promise<SessionSnapshot>`

Registers the device if needed, authenticates, and caches the token (~1h). Idempotent
— returns immediately if a valid token is already held. Returns a snapshot you can persist.

Calling it is optional: data methods log in (again) automatically when no valid token is
held, since the client always has the credentials.

### `getCheckinHistory({ startDate, endDate }): Promise<CheckIn[]>`

`startDate`/`endDate` are inclusive calendar dates: anything `Temporal.PlainDate.from()`
accepts (a `PlainDate`, `"2026-01-01"`, `{ year, month, day }`, …). Returns check-ins
sorted oldest → newest (the API itself returns them unordered):

```ts
interface CheckIn {
  id: number; // stable CheckLogID
  clubId: number;
  checkedInAt: Temporal.PlainDateTime; // the club's local wall-clock time
}
```

The API doesn't say which time zone a club is in, so `checkedInAt` is a `PlainDateTime`
rather than an instant. If you know the zone: `c.checkedInAt.toZonedDateTime("America/Toronto")`.

Several years fit comfortably in one call.

### `getAccountProfile(): Promise<AccountProfile>`

The profile screen from the app, grouped into sections:

```ts
interface AccountProfile {
  sections: { title: string; items: { label: string; value: string }[] }[];
}
// e.g. sections[0] = { title: "Account Information",
//                      items: [{ label: "Home Club", value: "…" }, …] }
```

Sections seen so far are "Account Information", "Personal Information", and
"Billing Information". Labels are passed through as the server sends them (minus the
trailing colon), so look rows up by `label`, not by position.

### `exportSession(): SessionSnapshot`

`{ deviceId, token, expiresAt }` (`expiresAt` is a `Temporal.Instant` string) — **no password**. Persist it and pass it back as
`session` next run to skip the slow register+login. You still supply `credentials`
(the password is required for Basic auth on data calls).

## Errors

All throw subclasses of `LAFitnessError`: `AuthError` (missing or rejected credentials), `ApiError` (`.status`, `.reason`;
also used for network failures and malformed responses), `TimeoutError`, and
`NotAuthenticatedError` (from `exportSession()` before any login).

Responses are validated with zod. If the API's shape changes, calls throw an `ApiError`
naming the offending field (the `ZodError` is on `.cause`) rather than returning
partially empty objects.

## How it works

Private endpoints need three things together: the `AuthToken` from login, HTTP Basic
auth (`username:password`), **and** a device that has been registered once via
`SaveUserPushSettings`. A private call without Basic auth isn't rejected — the server
just never answers, so it surfaces as a `TimeoutError`. A fresh device id is rejected with `401 reason: device` until
registered; the client does that automatically on first `login()`.

## License

MIT
