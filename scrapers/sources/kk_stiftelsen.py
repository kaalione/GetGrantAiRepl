import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class KKStiftelsenScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.kks.se/en/programmes-and-calls/"
        self.source_name = "KK-stiftelsen"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "KK-stiftelsen"
        self.default_category = "research"

    def fetch_grants(self):
        grants_data = []

        known_programs = [
            {"title": "Research Profiles - KK-stiftelsen", "url": "https://www.kks.se/en/program/research-profiles/"},
            {"title": "Synergy Projects - KK-stiftelsen", "url": "https://www.kks.se/en/program/synergy/"},
            {"title": "Industrial Graduate Schools - KK-stiftelsen", "url": "https://www.kks.se/en/program/industrial-graduate-schools/"},
            {"title": "Research Projects - KK-stiftelsen", "url": "https://www.kks.se/en/program/research-projects/"},
            {"title": "Education for Working Professionals - KK-stiftelsen", "url": "https://www.kks.se/en/program/education-for-working-professionals/"},
            {"title": "Capacity Building - KK-stiftelsen", "url": "https://www.kks.se/en/program/capacity-building/"},
        ]

        for prog in known_programs:
            self.rate_limit()
            detail = self.fetch_page(prog['url'])
            if not detail:
                print(f"  Skipping (404/error): {prog['title']}")
                continue

            description = ''
            desc_elem = detail.select_one('article, .main-content, main, .content')
            if desc_elem:
                paragraphs = desc_elem.find_all('p')
                description = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

            page_text = detail.get_text(' ', strip=True)
            amount_text = ''
            amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK|million)[^.]*)', page_text, re.IGNORECASE)
            if amount_match:
                amount_text = amount_match.group(1)

            deadline_text = ''
            date_match = re.search(r'(\d{4}-\d{2}-\d{2})', page_text)
            if not date_match:
                date_match = re.search(
                    r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
                    page_text, re.IGNORECASE
                )
            if date_match:
                deadline_text = date_match.group(1)

            raw = {
                'title': prog['title'],
                'url': prog['url'],
                'description': description,
                'eligibility': 'forskare, universitet, högskola, företag',
                'amount_text': amount_text,
                'status_text': 'open',
                'deadline_text': deadline_text,
                'category': self.default_category,
            }

            grants_data.append(raw)
            print(f"  Found: {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        if not grant['target_group'] or grant['target_group'] == ['all']:
            grant['target_group'] = ['research', 'higher_education', 'sme']
        return grant


if __name__ == "__main__":
    scraper = KKStiftelsenScraper()
    scraper.scrape()
