import { eq, desc } from "drizzle-orm";
import { db, bodyweightLogsTable, userProfilesTable } from "@workspace/db";

// `user_profiles.weight` is the "current weight" the dashboard shows and program
// generation reasons from. It is a cache of the newest bodyweight log, so it has to
// be recomputed from the logs rather than assigned from whichever write happened
// last: backfilling a check-in for last Tuesday used to overwrite today's weight,
// because both write paths just did `.set({ weight })` unconditionally.
//
// Reading the newest log back is also self-healing - editing a log downward or
// deleting the most recent one leaves the profile correct too, which an
// "only write if this date is newer" comparison would not.
//
// No logs left at all (the last one was deleted) leaves the profile's weight
// untouched: it's still the last thing the user told us, and nulling it would take
// the AI's starting point away for no reason.
export async function syncProfileWeightToLatestLog(userId: string): Promise<void> {
  const latest = await db.query.bodyweightLogsTable.findFirst({
    where: eq(bodyweightLogsTable.userId, userId),
    orderBy: [desc(bodyweightLogsTable.date)],
  });
  if (!latest) return;

  await db
    .update(userProfilesTable)
    .set({ weight: latest.weight, weightUnit: latest.weightUnit })
    .where(eq(userProfilesTable.userId, userId));
}
