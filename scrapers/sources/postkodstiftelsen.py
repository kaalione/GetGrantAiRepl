import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class PostkodstiftelsenScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://postkodstiftelsen.se/sok-stod/"
        self.source_name = "Postkodstiftelsen"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Postkodstiftelsen"
        self.default_category = "social"

    def fetch_grants(self):
        grants_data = []

        known_programs = [
            {"title": "Ordinarie projektstöd", "url": "https://postkodstiftelsen.se/sok-stod/"},
            {"title": "Grannskapsinitiativet", "url": "https://postkodstiftelsen.se/grannskapsinitiativet/"},
        ]

        alt_urls = {
            "https://postkodstiftelsen.se/sok-stod/": "https://postkodlotterietsstiftelse.se/sok-stod/",
            "https://postkodstiftelsen.se/grannskapsinitiativet/": "https://postkodlotterietsstiftelse.se/grannskapsinitiativet/",
        }

        for prog in known_programs:
            self.rate_limit()
            detail = self.fetch_page(prog['url'])
            if not detail and prog['url'] in alt_urls:
                self.rate_limit()
                detail = self.fetch_page(alt_urls[prog['url']])
                if detail:
                    prog['url'] = alt_urls[prog['url']]
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
            amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
            if amount_match:
                amount_text = amount_match.group(1)

            deadline_text = ''
            date_match = re.search(
                r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                page_text, re.IGNORECASE
            )
            if date_match:
                deadline_text = date_match.group(1)

            raw = {
                'title': prog['title'],
                'url': prog['url'],
                'description': description,
                'eligibility': 'ideella organisationer, föreningar',
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
        grant['source_type'] = 'stiftelse'
        if not grant['target_group'] or grant['target_group'] == ['all']:
            grant['target_group'] = ['nonprofit', 'social']
        return grant


if __name__ == "__main__":
    scraper = PostkodstiftelsenScraper()
    scraper.scrape()
