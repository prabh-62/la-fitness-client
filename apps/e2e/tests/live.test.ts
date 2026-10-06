/**
 * Opt-in tests against the real LA Fitness API, using your own account.
 * Skipped unless LAF_USERNAME and LAF_PASSWORD are set (shell env or apps/e2e/.env).
 * Read-only: they log in and read data, nothing is modified.
 */
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { LAFitnessClient } from "la-fitness-client";

const username = process.env.LAF_USERNAME;
const password = process.env.LAF_PASSWORD;

describe.skipIf(!username || !password)("live API", () => {
  let laf: LAFitnessClient;
  // Construct lazily: the describe body still runs when the suite is skipped.
  beforeAll(() => {
    laf = new LAFitnessClient({ credentials: { username: username!, password: password! } });
  });

  it("logs in and returns a session snapshot", async () => {
    const session = await laf.login();
    expect(session.token).toBeTruthy();
    expect(laf.isAuthenticated).toBe(true);
  });

  it("fetches several years of check-ins in one request", async () => {
    const startDate = Temporal.PlainDate.from("2022-05-01");
    const endDate = Temporal.Now.plainDateISO();
    const checkins = await laf.getCheckinHistory({ startDate, endDate });
    expect(checkins.length).toBeGreaterThan(0);
    const times = checkins.map((c) => c.checkedInAt);
    expect(times).toEqual(times.toSorted((a, b) => Temporal.PlainDateTime.compare(a, b)));
    for (const { checkedInAt } of checkins) {
      expect(checkedInAt).toBeInstanceOf(Temporal.PlainDateTime);
      const day = checkedInAt.toPlainDate();
      expect(Temporal.PlainDate.compare(day, startDate)).toBeGreaterThanOrEqual(0);
      expect(Temporal.PlainDate.compare(day, endDate)).toBeLessThanOrEqual(0);
    }
  });

  it("fetches the account profile", async () => {
    const profile = await laf.getAccountProfile();
    expect(profile.sections.length).toBeGreaterThan(0);
    expect(profile.sections.flatMap((s) => s.items).length).toBeGreaterThan(0);
  });
});
