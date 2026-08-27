import sys
import os
import re
import html

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class KonstnarsnamndenScraper(BaseScraper):
    """Konstnärsnämnden — stipendier och bidrag till yrkesverksamma konstnärer.

    Sajten är WordPress med ett publikt REST-API och en egen posttyp
    `grants`, så vi hämtar strukturerad data därifrån i stället för att
    skrapa den JS-renderade listsidan.
    """

    API_URL = "https://www.konstnarsnamnden.se/wp-json/wp/v2/grants"

    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.konstnarsnamnden.se/stipendier-och-bidrag/"
        self.source_name = "Konstnärsnämnden"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Konstnärsnämnden"
        self.default_category = "culture"

    @staticmethod
    def _strip_html(rendered):
        text = re.sub(r'<[^>]+>', ' ', rendered or '')
        text = html.unescape(text)
        return ' '.join(text.split())

    def fetch_grants(self):
        grants_data = []
        page = 1
        while True:
            resp = requests.get(
                self.API_URL,
                params={
                    'per_page': 100,
                    'page': page,
                    '_fields': 'id,link,title,content,modified',
                },
                headers=self.headers,
                timeout=30,
            )
            resp.raise_for_status()
            items = resp.json()
            if not items:
                break

            for item in items:
                title = self._strip_html(item.get('title', {}).get('rendered', ''))
                url = item.get('link', '')
                if not title or not url:
                    continue

                content = self._strip_html(item.get('content', {}).get('rendered', ''))
                # Klipp bort brödsmule-/menyfragment som ligger först i innehållet
                content = re.sub(
                    r'^.*?(Slutet på kategorimenyn|Startsida)\s*',
                    '', content, count=1
                )
                deadline_match = re.search(
                    r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                    content, re.IGNORECASE
                )

                grants_data.append({
                    'title': title,
                    'url': url,
                    'description': content[:3000],
                    'eligibility': '',
                    'amount_text': '',
                    'status_text': '',
                    'deadline_text': deadline_match.group(1) if deadline_match else '',
                    'category': self.default_category,
                })
                print(f"  Found: {title[:60]}")

            if len(items) < 100:
                break
            page += 1

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'myndighet'
        # Stipendierna återkommer årligen — utan känd deadline är de öppna.
        if not grant.get('deadline'):
            grant['status'] = 'open'
        # Konstnärsnämndens stöd riktar sig till yrkesverksamma inom konst
        # och kultur — sektorer i target_group så branschmatchningen ser det.
        for sector in ('culture', 'creative'):
            if sector not in grant['target_group']:
                grant['target_group'].append(sector)
        return grant


if __name__ == "__main__":
    scraper = KonstnarsnamndenScraper()
    scraper.scrape()
