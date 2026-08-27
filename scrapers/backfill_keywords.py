"""One-off backfill: recompute per-grant keywords for all existing grants.

Applies the same refine_keywords() logic that upsert_grant now runs on every
scrape: lexicon extraction from the grant's own title/description plus the
subset of existing keywords that are grounded in that text. Run with
--dry-run to see the change distribution without writing.

Usage:
    python3 scrapers/backfill_keywords.py [--dry-run]
"""

import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.db import get_connection
from utils.keywords import refine_keywords


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, title, description, keywords FROM grants")
            rows = cur.fetchall()
            print(f"Loaded {len(rows)} grants")

            changed = 0
            emptied = 0
            updates = []
            for grant_id, title, description, keywords in rows:
                new_keywords = refine_keywords(title, description, keywords or [])
                if new_keywords != (keywords or []):
                    updates.append((new_keywords, grant_id))
                    changed += 1
                    if not new_keywords:
                        emptied += 1

            print(f"Changed: {changed}, of which now empty: {emptied}")
            if args.dry_run:
                for new_kw, gid in updates[:15]:
                    print(f"  {gid}: {new_kw}")
                return

            cur.executemany(
                "UPDATE grants SET keywords = %s, updated_at = NOW() WHERE id = %s",
                updates,
            )
        conn.commit()
        print("Done.")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
