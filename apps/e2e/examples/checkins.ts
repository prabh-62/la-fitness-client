/**
 * Runnable example: log in and fetch a year of check-ins in one request.
 *
 *   vp run example:checkins            (from apps/e2e; reads apps/e2e/.env)
 *
 * Credentials come from LAF_USERNAME / LAF_PASSWORD (env or apps/e2e/.env).
 */
import { LAFitnessClient } from "la-fitness-client";

const { LAF_USERNAME: username, LAF_PASSWORD: password } = process.env;
if (!username || !password) {
  console.error("Set LAF_USERNAME and LAF_PASSWORD (see apps/e2e/.env.example).");
  process.exit(1);
}

const laf = new LAFitnessClient({ credentials: { username, password } });

const endDate = Temporal.Now.plainDateISO();
const startDate = endDate.subtract({ years: 1 });
console.log(`Fetching check-ins ${startDate.toString()} → ${endDate.toString()} …`);

const checkins = await laf.getCheckinHistory({ startDate, endDate });
console.log(`${checkins.length} check-ins`);
for (const c of checkins.slice(0, 10)) {
  console.log(`  ${c.checkedInAt.toLocaleString()}  ·  club ${c.clubId}`);
}
if (checkins.length > 10) console.log(`  … and ${checkins.length - 10} more`);
