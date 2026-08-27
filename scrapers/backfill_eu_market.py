"""One-off backfill: tag EU-wide/multinational funding sources with market='eu'.

These programmes accept applicants from all Nordic markets, but were stored
with the default market='se' (NordForsk with 'no'), so Norwegian and Finnish
companies never saw them. market='eu' means "multi-country programme, visible
in every market" — the API and matching filters include 'eu' grants for all
company markets.

Usage:
    python3 scrapers/backfill_eu_market.py [--dry-run]
"""

import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.db import get_connection

EU_WIDE_SOURCES = [
    'EU Funding & Tenders',
    'EU Horizon Europe',
    'CASSINI / EUSPA',
    'COST Actions',
    'European Defence Fund (EDF)',
    'IHI (Innovative Health Initiative)',
    'NLnet Foundation / NGI Zero',
    'NATO SPS',
    'NordForsk',
    'Nordic Innovation',
    'EIT Climate-KIC',
    'EIT Culture & Creativity',
    'EIT Digital (28digital)',
    'EIT Food',
    'EIT Health',
    'EIT InnoEnergy',
    'EIT Manufacturing',
    'EIT RawMaterials',
    'EIT Urban Mobility',
    'Interreg Aurora',
    'Interreg Baltic Sea',
    'Interreg Central Baltic',
    'Interreg North Sea',
    'Interreg ÖKS',
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT source_name, market, count(*) FROM grants "
                "WHERE source_name = ANY(%s) AND market IS DISTINCT FROM 'eu' "
                "GROUP BY 1, 2 ORDER BY 1",
                (EU_WIDE_SOURCES,),
            )
            rows = cur.fetchall()
            total = sum(r[2] for r in rows)
            for source, market, count in rows:
                print(f"  {source}: {count} grants ({market} -> eu)")
            print(f"Total to update: {total}")

            if args.dry_run:
                return

            cur.execute(
                "UPDATE grants SET market = 'eu', updated_at = NOW() "
                "WHERE source_name = ANY(%s) AND market IS DISTINCT FROM 'eu'",
                (EU_WIDE_SOURCES,),
            )
            print(f"Updated: {cur.rowcount}")
        conn.commit()
        print("Done.")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
