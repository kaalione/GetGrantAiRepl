import { db } from "../db";
import { scraperLogs } from "@shared/schema";
import { and, eq, lt, sql } from "drizzle-orm";

// A scraper log row is set to "running" before the process starts and updated
// when it closes. If the process never closes — the container is restarted or
// killed while scrapers are mid-flight — the row is stranded at "running"
// forever, so the UI shows work that is not happening and the history lies.
//
// Nothing can still be running from before this process started, since the
// child processes belonged to the previous one.
export async function reapStaleScraperLogs(): Promise<number> {
  const cutoff = sql`now() - interval '30 minutes'`;
  const stale = await db
    .update(scraperLogs)
    .set({
      status: "failed",
      errorMessage: "Interrupted — the server restarted while this scraper was running",
    })
    .where(and(eq(scraperLogs.status, "running"), lt(scraperLogs.scrapedAt, cutoff)))
    .returning({ id: scraperLogs.id });

  if (stale.length > 0) {
    console.log(`[Scrapers] Marked ${stale.length} interrupted run(s) as failed`);
  }
  return stale.length;
}
