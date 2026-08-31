import { db } from "../db";
import { grants } from "@shared/schema";
import { sql } from "drizzle-orm";

// Closed grants are hidden from the product, but they are not deleted on sight:
// most Swedish and EU calls recur annually, so last year's closed call is the
// best evidence that this year's is coming. They are only removed once they are
// old enough to have stopped being that signal.
const DEFAULT_RETENTION_DAYS = 365;

export async function pruneClosedGrants(): Promise<{ removed: number; retentionDays: number }> {
  const retentionDays = Number(process.env.CLOSED_GRANT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);

  // Anything a person has touched stays, whatever its age: an application, a
  // bookmark, an alert match, a stored explanation, an eligibility check or a
  // sent notification all become broken references if the grant disappears.
  // The foreign keys are ON DELETE NO ACTION, so this is correctness, not tidiness.
  const removed = await db.execute(sql`
    DELETE FROM grants g
    WHERE g.status = 'closed'
      AND COALESCE(g.deadline, g.created_at) < now() - (${retentionDays} || ' days')::interval
      AND NOT EXISTS (SELECT 1 FROM applications        a WHERE a.grant_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM grant_bookmarks     b WHERE b.grant_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM alert_matches       m WHERE m.grant_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM match_explanations  e WHERE e.grant_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM eligibility_checks  c WHERE c.grant_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM notifications       n WHERE n.grant_id = g.id)
    RETURNING g.id
  `);

  const count = removed.rows.length;
  if (count > 0) {
    console.log(`[Grants] Pruned ${count} closed grant(s) older than ${retentionDays} days`);
  }
  return { removed: count, retentionDays };
}
