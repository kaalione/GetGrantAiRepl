"""One-off backfill: company target groups for grants that mention companies.

extract_target_groups() had triggers for SME/startup/storföretag but none for
a plain "företag"/"bedrift"/"yritys", so grants like Klimatklivet ("kommuner,
regioner, företag och organisationer") were tagged as public-sector/nonprofit
only and scored as if companies weren't eligible. Fix the actual mislabels in
existing rows: where the target group claims non-company audiences only but
the grant's own text mentions companies, add sme+large_enterprise (= companies
of any size). Plain {all} rows are left untouched — that's not a mislabel.

Usage:
    python3 scrapers/backfill_target_groups.py [--dry-run]
"""

import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.db import get_connection

SIZE_GROUPS = {'startup', 'sme', 'large_enterprise', 'sole_proprietor'}
COMPANY_WORDS = ['företag', 'bolag', 'bedrift', 'yritys', 'yrityk', 'companies']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, target_group,
                       lower(title || ' ' || description || ' ' ||
                             coalesce(eligibility_criteria::text, '')) AS text
                FROM grants
                """
            )
            rows = cur.fetchall()
            updates = []
            ORG_ONLY = {'nonprofit', 'public_sector', 'research', 'government', 'public', 'higher_education'}
            for grant_id, target_group, text in rows:
                tg = list(target_group or [])
                # Endast äkta fellabels: icke-företagsgrupper fångade trots att
                # texten uttryckligen nämner företag. {all}/tom rörs inte.
                if not tg or not set(tg) & ORG_ONLY:
                    continue
                if SIZE_GROUPS & set(tg) or 'all' in tg:
                    continue
                if not any(w in text for w in COMPANY_WORDS):
                    continue
                updates.append((tg + ['sme', 'large_enterprise'], grant_id))

            print(f"Rows to update: {len(updates)} of {len(rows)}")
            if args.dry_run:
                return
            cur.executemany(
                "UPDATE grants SET target_group = %s, updated_at = NOW() WHERE id = %s",
                updates,
            )
        conn.commit()
        print("Done.")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
