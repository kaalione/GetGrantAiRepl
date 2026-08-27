"""One-off backfill: national region for national agencies' grants.

Programmes from national agencies (Forskningsrådet, Innovasjon Norge,
Energimyndigheten, Business Finland ...) are open country-wide, but most of
their grants carry no region data at all, so matching scores them
region-neutral while e.g. Vinnova's API-sourced grants carry 'hela_sverige'.
Fill in the national region where region data is missing — both in
structured_eligibility.geography.regions (what matching prefers) and in
eligibility_criteria.regions (the fallback for rows without structured data).

Regional sources (Länsstyrelserna, Region Skåne, Regionalforvaltning.no,
ELY-keskus ...) are deliberately NOT touched.

Usage:
    python3 scrapers/backfill_national_regions.py [--dry-run]
"""

import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.db import get_connection

NATIONAL_SOURCES = {
    'hela_sverige': [
        'Vinnova', 'Vinnova Funding API', 'Tillväxtverket', 'Energimyndigheten',
        'Naturvårdsverket', 'Boverket', 'Formas', 'Forte', 'Jordbruksverket',
        'Kulturrådet', 'Konstnärsnämnden', 'EKN (Exportkreditnämnden)',
        'KK-stiftelsen', 'Stiftelsen för Strategisk Forskning',
        'Internetstiftelsen', 'Postkodstiftelsen', 'Almi', 'Verksamt.se',
    ],
    'hele_norge': ['Forskningsrådet', 'Innovasjon Norge', 'Enova', 'SkatteFUNN'],
    'suomi': ['Business Finland', 'Ruokavirasto', 'Suomi.fi', 'Starttiraha', 'Finnpartnership'],
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for region, sources in NATIONAL_SOURCES.items():
                # structured_eligibility är vad matchningen föredrar
                cur.execute(
                    """
                    SELECT count(*) FROM grants
                    WHERE source_name = ANY(%s)
                      AND structured_eligibility IS NOT NULL
                      AND coalesce(jsonb_array_length(structured_eligibility->'geography'->'regions'), 0) = 0
                    """,
                    (sources,),
                )
                n_structured = cur.fetchone()[0]
                cur.execute(
                    """
                    SELECT count(*) FROM grants
                    WHERE source_name = ANY(%s)
                      AND structured_eligibility IS NULL
                      AND coalesce(jsonb_array_length(eligibility_criteria->'regions'), 0) = 0
                    """,
                    (sources,),
                )
                n_raw = cur.fetchone()[0]
                print(f"{region}: {n_structured} structured + {n_raw} raw rows to fill")

                if args.dry_run:
                    continue

                cur.execute(
                    """
                    UPDATE grants
                    SET structured_eligibility = jsonb_set(
                          jsonb_set(structured_eligibility, '{geography}',
                                    coalesce(structured_eligibility->'geography', '{}'::jsonb), true),
                          '{geography,regions}', %s::jsonb, true),
                        updated_at = NOW()
                    WHERE source_name = ANY(%s)
                      AND structured_eligibility IS NOT NULL
                      AND coalesce(jsonb_array_length(structured_eligibility->'geography'->'regions'), 0) = 0
                    """,
                    (json.dumps([region]), sources),
                )
                cur.execute(
                    """
                    UPDATE grants
                    SET eligibility_criteria = jsonb_set(
                          coalesce(eligibility_criteria, '{}'::jsonb),
                          '{regions}', %s::jsonb, true),
                        updated_at = NOW()
                    WHERE source_name = ANY(%s)
                      AND structured_eligibility IS NULL
                      AND coalesce(jsonb_array_length(eligibility_criteria->'regions'), 0) = 0
                    """,
                    (json.dumps([region]), sources),
                )
        conn.commit()
        print("Done." if not args.dry_run else "Dry run — nothing written.")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
