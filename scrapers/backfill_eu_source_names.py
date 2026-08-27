"""One-off backfill: programme-accurate source names for EU F&T grants.

'EU Funding & Tenders' grants carry their EU programme in the call identifier
(HORIZON-CL5-..., CREA-CULT-..., DIGITAL-...). Relabel them with the actual
programme so users (and matching diagnostics) can tell a Horizon Europe call
from a Creative Europe call. Uses the same mapping as the scraper.

Usage:
    python3 scrapers/backfill_eu_source_names.py [--dry-run]
"""

import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.db import get_connection
from sources.eu_funding import EUFundingScraper


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, raw_data->'identifier'->>0 FROM grants "
                "WHERE source_name = 'EU Funding & Tenders'"
            )
            rows = cur.fetchall()
            updates = {}
            for grant_id, identifier in rows:
                name = EUFundingScraper.source_name_for_identifier(identifier or '')
                if name != 'EU Funding & Tenders':
                    updates.setdefault(name, []).append(grant_id)

            for name, ids in sorted(updates.items()):
                print(f"  {name}: {len(ids)}")
            total = sum(len(v) for v in updates.values())
            print(f"Total to relabel: {total} of {len(rows)}")

            if args.dry_run:
                return

            for name, ids in updates.items():
                cur.execute(
                    "UPDATE grants SET source_name = %s, updated_at = NOW() "
                    "WHERE id = ANY(%s)",
                    (name, ids),
                )
        conn.commit()
        print("Done.")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
