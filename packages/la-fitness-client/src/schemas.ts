/**
 * zod schemas for the raw API payloads. They validate what the server sends and
 * transform it into the public domain types, so shape drift fails loudly
 * (as an `ApiError`) instead of silently producing empty/partial objects.
 */
import { z } from "zod";
import type { AccountProfile, AccountProfileSection, CheckIn } from "./types.ts";

/** The `{ Success, Message, Value }` wrapper every endpoint responds with. */
export const Envelope = z.object({
  Success: z.boolean(),
  Message: z.string().nullish(),
  Value: z.unknown(),
});

/** `AuthenticateAccount` returns `"<server time> |<token>"`. */
export const AuthTokenResponse = z
  .string()
  .includes("|", { message: "Expected '<time> |<token>'" })
  .transform((s) => s.slice(s.indexOf("|") + 1).trim())
  .pipe(z.string().min(1, { message: "Empty auth token" }));

const API_DATE_TIME = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([AP]M)$/;

/**
 * `"09/03/2026 10:20:22 AM"` → `Temporal.PlainDateTime`. The API sends the
 * club's local wall-clock time with no zone, so no instant is implied.
 */
const ApiDateTime = z.string().transform((s, ctx) => {
  const m = API_DATE_TIME.exec(s);
  if (m) {
    const [month, day, year, hour12, minute, second] = m.slice(1, 7).map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const hour = (hour12 % 12) + (m[7] === "PM" ? 12 : 0);
    try {
      return Temporal.PlainDateTime.from(
        { year, month, day, hour, minute, second },
        { overflow: "reject" },
      );
    } catch {
      // Out-of-range component, e.g. month 13 — reported below.
    }
  }
  ctx.addIssue({ code: "custom", message: `Expected "MM/DD/YYYY hh:mm:ss AM|PM", got "${s}"` });
  return z.NEVER;
});

const CheckInRow = z
  .object({ CheckLogID: z.number(), Club_ID: z.number(), DateStr: ApiDateTime })
  .transform((r): CheckIn => ({ id: r.CheckLogID, clubId: r.Club_ID, checkedInAt: r.DateStr }));

/**
 * The API returns rows in no particular order; sort them oldest → newest.
 * An empty range comes back as `[]`; `null` is tolerated the same way.
 */
export const CheckinHistoryResponse = z
  .array(CheckInRow)
  .nullable()
  .transform((rows) =>
    (rows ?? []).sort((a, b) => Temporal.PlainDateTime.compare(a.checkedInAt, b.checkedInAt)),
  );

/** Row keys with special meaning in the profile list. */
const SECTION_HEADER = "*";
const ACTION_LINK = "-";

export const AccountProfileResponse = z
  .array(z.object({ Key: z.string(), Value: z.string().nullish() }))
  .transform((rows): AccountProfile => {
    const sections: AccountProfileSection[] = [];
    for (const { Key, Value } of rows) {
      if (Key === SECTION_HEADER) {
        sections.push({ title: Value ?? "", items: [] });
      } else if (Key !== ACTION_LINK) {
        // ACTION_LINK rows are app buttons ("Edit Personal Information"), not data.
        if (sections.length === 0) sections.push({ title: "", items: [] });
        sections.at(-1)!.items.push({ label: Key.replace(/:\s*$/, ""), value: Value ?? "" });
      }
    }
    return { sections };
  });
