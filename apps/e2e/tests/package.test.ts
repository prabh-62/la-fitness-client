/**
 * Smoke tests from a consumer's point of view: everything is imported from the
 * package name, so this exercises the built `dist/` output and `exports` map
 * rather than the library's source files.
 */
import { describe, expect, it } from "vite-plus/test";
import * as pkg from "la-fitness-client";
import {
  ApiError,
  AuthError,
  LAFitnessClient,
  LAFitnessError,
  NotAuthenticatedError,
  TimeoutError,
  type CheckIn,
} from "la-fitness-client";

const ok = (value: unknown) =>
  new Response(JSON.stringify({ Success: true, Value: value }), { status: 200 });

describe("public surface", () => {
  it("exposes the documented runtime exports", () => {
    expect(Object.keys(pkg).sort()).toEqual(
      [
        "ApiError",
        "AuthError",
        "LAFitnessClient",
        "LAFitnessError",
        "NotAuthenticatedError",
        "TimeoutError",
      ].sort(),
    );
  });

  it("keeps the error hierarchy intact across the bundle boundary", () => {
    for (const E of [ApiError, AuthError, NotAuthenticatedError, TimeoutError]) {
      expect(E.prototype).toBeInstanceOf(LAFitnessError);
    }
  });
});

describe("end-to-end flow (mocked transport)", () => {
  it("logs in and maps check-ins", async () => {
    const responses = [
      ok("10/4/26 1:00:00 PM |TOKEN"),
      ok([{ CheckLogID: 7, Club_ID: 1141, DateStr: "01/02/2024 06:00:00 AM" }]),
    ];
    const fetch = (async () => responses.shift()!) as typeof globalThis.fetch;

    const laf = new LAFitnessClient({
      credentials: { username: "member@example.com", password: "pw" },
      deviceId: "0123456789abcdef",
      fetch,
    });
    const session = await laf.login();
    const checkins: CheckIn[] = await laf.getCheckinHistory({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });

    expect(session).toMatchObject({ deviceId: "0123456789abcdef", token: "TOKEN" });
    expect(checkins).toEqual([
      { id: 7, clubId: 1141, checkedInAt: Temporal.PlainDateTime.from("2024-01-02T06:00:00") },
    ]);
  });
});
