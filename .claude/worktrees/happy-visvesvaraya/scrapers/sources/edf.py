import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.eu_funding import EUFundingScraper
from utils.db import log_scrape_result, get_grant_urls_by_source


class EdfScraper(EUFundingScraper):
    SECTOR_TAGS = ["försvar", "dual-use", "säkerhetsteknik", "försvarstech"]
    EU_FT_SOURCE_NAME = "EU Funding & Tenders"

    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.source_name = "European Defence Fund (EDF)"

    def _deduplicate_against_eu_ft(self, results):
        existing_urls = get_grant_urls_by_source(self.EU_FT_SOURCE_NAME)
        if not existing_urls:
            print(f"  EDF dedup: No existing EU F&T grants found, keeping all {len(results)}")
            return results

        deduped = []
        skipped = 0
        for result in results:
            url = ''
            if isinstance(result, dict):
                url = result.get('url', '') or result.get('source_url', '') or result.get('metadata', {}).get('url', '')
                if not url:
                    links = result.get('metadata', {}).get('links', {})
                    if isinstance(links, dict):
                        url = links.get('self', '') or links.get('topic', '')
            if url and url in existing_urls:
                skipped += 1
            else:
                deduped.append(result)

        print(f"  EDF dedup: {len(results)} fetched, {skipped} already in EU F&T, {len(deduped)} unique")
        return deduped

    def scrape(self, source_id=None, max_results=None) -> int:
        sid = source_id or self.source_id
        print(f"\n{'='*60}")
        print("Starting European Defence Fund (EDF) scrape...")
        print(f"{'='*60}")

        try:
            results = self.fetch_all_grants(
                funding_type='grants',
                status='open',
                programmes=['edf'],
                max_results=max_results
            )

            if not results:
                print("No EDF grants found")
                if sid:
                    log_scrape_result(source_id=sid, status='success', grants_found=0, error_message='No EDF results')
                return 0

            results = self._deduplicate_against_eu_ft(results)

            print(f"Processing {len(results)} EDF grants...")

            inserted = 0
            skipped = 0

            for result in results:
                try:
                    grant = self.transform_to_grant(result)
                    if grant and grant['title'] and grant['url']:
                        grant['source_name'] = self.source_name
                        grant['source_type'] = 'EU/Försvars-FoU'
                        existing_kw = grant.get('keywords', [])
                        for tag in self.SECTOR_TAGS:
                            if tag not in existing_kw:
                                existing_kw.append(tag)
                        grant['keywords'] = existing_kw

                        if grant.get('eligibility_criteria') and isinstance(grant['eligibility_criteria'], dict):
                            elig_text = grant['eligibility_criteria'].get('text', '')
                            if 'EU-länder' not in elig_text:
                                elig_text += ' Kräver minst 3 legala enheter från 3 olika EU-länder. Sverige fullt berättigat.'
                                grant['eligibility_criteria'] = {'text': elig_text.strip()}
                        else:
                            grant['eligibility_criteria'] = {
                                'text': 'Kräver minst 3 legala enheter från 3 olika EU-länder. Inga tredjelandsaktörer. Sverige fullt berättigat.'
                            }

                        from utils.db import upsert_grant
                        upsert_grant(grant)
                        inserted += 1
                    else:
                        skipped += 1
                except Exception as e:
                    skipped += 1
                    print(f"  Error processing EDF grant: {e}")

            if sid:
                log_scrape_result(source_id=sid, status='success', grants_found=inserted)

            print(f"\nEDF RESULTS: Inserted/Updated: {inserted}, Skipped: {skipped}")
            return inserted

        except Exception as e:
            error_msg = str(e)
            print(f"EDF scrape failed: {error_msg}")
            if sid:
                log_scrape_result(source_id=sid, status='failed', grants_found=0, error_message=error_msg)
            import traceback
            traceback.print_exc()
            return 0


if __name__ == "__main__":
    scraper = EdfScraper()
    result = scraper.scrape()
    print(f"\nEDF scrape complete: {result} grants processed")
