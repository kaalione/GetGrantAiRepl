import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class RegionVGRScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.vgregion.se/regional-utveckling/soka-stod/projektstod/"
        self.source_name = "Västra Götalandsregionen"
        self.organization = "Västra Götalandsregionen"
        self.default_category = "regional"

    def fetch_grants(self):
        grants_data = []

        known_programs = [
            {"title": "Projektstöd regional utveckling", "url": "https://www.vgregion.se/regional-utveckling/soka-stod/projektstod/ansok-om-projektstod/att-kanna-till-innan-du-ansoker/"},
            {"title": "Företagsfinansiering", "url": "https://www.vgregion.se/regional-utveckling/omraden/naringsliv/foretagsfinansiering/"},
            {"title": "Regionalt investeringsstöd", "url": "https://www.vgregion.se/regional-utveckling/omraden/naringsliv/foretagsfinansiering/regionalt-investeringsstod/"},
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
                'eligibility': 'organisationer i Västra Götaland',
                'amount_text': amount_text,
                'status_text': 'open',
                'deadline_text': deadline_text,
                'category': self.default_category,
            }

            grants_data.append(raw)
            print(f"  Found: {prog['title'][:60]}")

        self.rate_limit()
        soup = self.fetch_page(self.base_url)
        if soup:
            links = soup.select('a[href*="/soka-stod/"], a[href*="finansiering"]')
            existing_urls = set(g['url'] for g in grants_data)
            for link in links:
                href = link.get('href', '')
                if not href or href == '#':
                    continue
                if not href.startswith('http'):
                    href = 'https://www.vgregion.se' + href
                if href.rstrip('/') == self.base_url.rstrip('/'):
                    continue
                if href in existing_urls:
                    continue
                existing_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue

                raw = {
                    'title': title,
                    'url': href,
                    'description': '',
                    'eligibility': '',
                    'amount_text': '',
                    'status_text': 'open',
                    'deadline_text': '',
                    'category': self.default_category,
                }
                grants_data.append(raw)
                print(f"  Found: {title[:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        if 'västra götaland' not in [g.lower() for g in grant['target_group']]:
            grant['target_group'].append('västra götaland')
        return grant


if __name__ == "__main__":
    scraper = RegionVGRScraper()
    scraper.scrape()
