import { describe, expect, it } from "vite-plus/test";
import { LAFitnessClient } from "../src/client.ts";
import { ApiError, AuthError, NotAuthenticatedError, TimeoutError } from "../src/errors.ts";
import type { LAFitnessClientOptions } from "../src/types.ts";

interface CapturedRequest {
  path: string;
  value: unknown;
  headers: Record<string, string>;
}

/** A scripted fetch mock: queue responses, inspect captured requests. */
function mockFetch(script: Response[]) {
  const calls: CapturedRequest[] = [];
  const fn: typeof fetch = async (input, init) => {
    const url = input as string;
    const body = JSON.parse(init!.body as string) as { request: { Value?: unknown } };
    calls.push({
      path: url.split("/Services/")[1]!,
      value: body.request.Value,
      headers: init!.headers as Record<string, string>,
    });
    const res = script.shift();
    if (!res) throw new Error(`No scripted response for ${url}`);
    return res;
  };
  return { fn, calls };
}

const ok = (value: unknown) => Response.json({ Success: true, Value: value });
const fail = (message: string) => Response.json({ Success: false, Message: message, Value: null });
const deviceReject = () =>
  new Response("<html>401</html>", { status: 401, headers: { reason: "device" } });

const credentials = { username: "member@example.com", password: "s3cret" };
const inOneHour = () => Temporal.Now.instant().add({ hours: 1 }).toString();
const range = { startDate: "2024-01-01", endDate: "2024-01-31" };

/** A client with a valid resumed session, so calls go straight to the endpoint. */
function client(script: Response[], options: Partial<LAFitnessClientOptions> = {}) {
  return freshClient(script, {
    session: { deviceId: "dev1", token: "T", expiresAt: inOneHour() },
    ...options,
  });
}

/** A client with no session: the first call has to log in. */
function freshClient(script: Response[], options: Partial<LAFitnessClientOptions> = {}) {
  const { fn, calls } = mockFetch(script);
  const laf = new LAFitnessClient({ credentials, fetch: fn, ...options });
  return { laf, calls };
}

describe("login", () => {
  it("registers the device on first-time 401 then authenticates", async () => {
    const { laf, calls } = freshClient([
      deviceReject(),
      ok(null),
      ok("10/4/26 1:00:00 PM |TOKEN123"),
    ]);
    const session = await laf.login();

    expect(calls.map((c) => c.path)).toEqual([
      "public.svc/AuthenticateAccount",
      "Public.svc/SaveUserPushSettings",
      "public.svc/AuthenticateAccount",
    ]);
    expect(session.token).toBe("TOKEN123");
    expect(session.deviceId).toMatch(/^[0-9a-f]{16}$/);
    expect(laf.isAuthenticated).toBe(true);
  });

  it("is a no-op when the resumed token is still valid", async () => {
    const { laf, calls } = client([]);
    expect((await laf.login()).token).toBe("T");
    expect(calls).toHaveLength(0);
  });

  it("throws AuthError when the server rejects the credentials", async () => {
    const { laf } = freshClient([fail("Invalid username or password.")]);
    await expect(laf.login()).rejects.toThrow(AuthError);
  });

  it("re-logs in transparently when a data call finds the token expired", async () => {
    const expired = Temporal.Now.instant().subtract({ seconds: 1 }).toString();
    const { laf, calls } = client([ok("10/4/26 1:00:00 PM |FRESH"), ok([])], {
      session: { deviceId: "dev1", token: "STALE", expiresAt: expired },
    });
    await laf.getCheckinHistory(range);

    expect(calls.map((c) => c.path)).toEqual([
      "public.svc/AuthenticateAccount",
      "Private.svc/GetCheckinHistory",
    ]);
    expect(calls[1]!.headers["AuthToken"]).toBe("FRESH");
  });

  it("requires credentials", () => {
    expect(() => new LAFitnessClient({ credentials: { username: "", password: "x" } })).toThrow(
      AuthError,
    );
  });

  it("throws NotAuthenticatedError from exportSession() before any login", () => {
    const { laf } = freshClient([]);
    expect(() => laf.exportSession()).toThrow(NotAuthenticatedError);
  });
});

describe("getCheckinHistory", () => {
  it("sends M/D/YY dates with token + Basic auth and maps rows to PlainDateTime", async () => {
    const { laf, calls } = client([
      ok([
        { CheckLogID: 51667269, Club_ID: 1141, DateStr: "05/26/2022 11:53:15 AM" },
        { CheckLogID: 51667270, Club_ID: 1141, DateStr: "06/01/2022 07:05:00 PM" },
      ]),
    ]);
    const checkins = await laf.getCheckinHistory({
      startDate: Temporal.PlainDate.from("2022-05-01"),
      endDate: "2022-06-30",
    });

    expect(checkins.map((c) => [c.id, c.clubId, c.checkedInAt.toString()])).toEqual([
      [51667269, 1141, "2022-05-26T11:53:15"],
      [51667270, 1141, "2022-06-01T19:05:00"],
    ]);
    expect(calls[0]!.value).toEqual({ FromDate: "5/1/22", ToDate: "6/30/22" });
    expect(calls[0]!.headers["AuthToken"]).toBe("T");
    expect(calls[0]!.headers["Authorization"]).toBe(
      `Basic ${Buffer.from("member@example.com:s3cret").toString("base64")}`,
    );
  });

  it.each([
    ["12:30:00 AM", "00:30:00"],
    ["12:30:00 PM", "12:30:00"],
    ["07:05:00 PM", "19:05:00"],
  ])("converts %s to %s", async (time, expected) => {
    const { laf } = client([ok([{ CheckLogID: 1, Club_ID: 1, DateStr: `01/01/2024 ${time}` }])]);
    const [c] = await laf.getCheckinHistory(range);
    expect(c!.checkedInAt.toPlainTime().toString()).toBe(expected);
  });

  it("sorts check-ins oldest first, since the API returns them unordered", async () => {
    const { laf } = client([
      ok([
        { CheckLogID: 2, Club_ID: 1, DateStr: "03/18/2026 07:00:26 AM" },
        { CheckLogID: 3, Club_ID: 1, DateStr: "10/05/2026 09:50:37 AM" },
        { CheckLogID: 1, Club_ID: 1, DateStr: "03/04/2026 07:32:01 AM" },
      ]),
    ]);
    expect((await laf.getCheckinHistory(range)).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it.each([[[]], [null]])("returns [] for an empty range (%j)", async (value) => {
    const { laf } = client([ok(value)]);
    expect(await laf.getCheckinHistory(range)).toEqual([]);
  });
});

describe("getAccountProfile", () => {
  it("groups the flat Key/Value list into sections", async () => {
    const { laf } = client([
      ok([
        { Key: "*", Value: "Account Information" },
        { Key: "First Name:", Value: "Pat" },
        { Key: "Home Club:", Value: "SOME CLUB" },
        { Key: "*", Value: "Personal Information" },
        { Key: "City:", Value: "Springfield" },
        { Key: "-", Value: "Edit Personal Information" },
        { Key: "*", Value: "Billing Information" },
        { Key: "Card # (Last 4):", Value: null },
      ]),
    ]);
    expect(await laf.getAccountProfile()).toEqual({
      sections: [
        {
          title: "Account Information",
          items: [
            { label: "First Name", value: "Pat" },
            { label: "Home Club", value: "SOME CLUB" },
          ],
        },
        { title: "Personal Information", items: [{ label: "City", value: "Springfield" }] },
        { title: "Billing Information", items: [{ label: "Card # (Last 4)", value: "" }] },
      ],
    });
  });
});

describe("errors", () => {
  it("names the offending field when a row doesn't match the schema", async () => {
    const { laf } = client([ok([{ CheckLogID: "oops", Club_ID: 1, DateStr: "x" }])]);
    const err = await laf.getCheckinHistory(range).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/CheckLogID/);
  });

  it("rejects impossible check-in timestamps", async () => {
    const { laf } = client([
      ok([{ CheckLogID: 1, Club_ID: 1, DateStr: "13/45/2024 10:00:00 AM" }]),
    ]);
    await expect(laf.getCheckinHistory(range)).rejects.toThrow(/MM\/DD\/YYYY/);
  });

  it("wraps a non-JSON body in ApiError", async () => {
    const { laf } = client([new Response("<html>maintenance</html>")]);
    await expect(laf.getAccountProfile()).rejects.toBeInstanceOf(ApiError);
  });

  it("surfaces the server message when Success is false", async () => {
    const { laf } = client([fail("Try later.")]);
    await expect(laf.getAccountProfile()).rejects.toThrow("Try later.");
  });

  it("maps an aborted request to TimeoutError", async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
      });
    const { laf } = client([], { fetch: hang, timeoutMs: 10 });
    await expect(laf.getAccountProfile()).rejects.toBeInstanceOf(TimeoutError);
  });
});
