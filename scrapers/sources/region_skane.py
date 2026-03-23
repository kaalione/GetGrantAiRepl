import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class RegionSkaneScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://utveckling.skane.se/soka-stod/"
        self.source_name = "Region Skåne"
        self.organization = "Region Skåne"
        self.default_category = "regional"

    def fetch_grants(self):
        grants_data = []

        known_pages = [
            {"title": "Bidrag att söka - Region Skåne", "url": "https://utveckling.skane.se/soka-stod/bidrag-att-soka/"},
            {"title": "Kulturstöd - Region Skåne", "url": "https://utveckling.skane.se/kulturutveckling/kulturstod/"},
            {"title": "EU-program - Region Skåne", "url": "https://utveckling.skane.se/soka-stod/eu-program/"},
            {"title": "Stöd för affärsutveckling och strategisk kompetensförsörjning", "url": "https://utveckling.skane.se/regional-utveckling/verksamhetsomraden/naringsliv/kompetensforsorjning/stod-for-affarsutveckling-och-strategisk-kompetensforsorjning/"},
        ]

        for page in known_pages:
            self.rate_limit()
            detail = self.fetch_page(page['url'])
            if not detail:
                print(f"  Skipping (404/error): {page['title']}")
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
            date_match = re.search(r'(\d{4}-\d{2}-\d{2})', page_text)
            if not date_match:
                date_match = re.search(
                    r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                    page_text, re.IGNORECASE
                )
            if date_match:
                deadline_text = date_match.group(1)

            raw = {
                'title': page['title'],
                'url': page['url'],
                'description': description,
                'eligibility': '',
                'amount_text': amount_text,
                'status_text': 'open',
                'deadline_text': deadline_text,
                'category': self.default_category,
            }

            grants_data.append(raw)
            print(f"  Found: {page['title'][:60]}")

        soup = self.fetch_page(self.base_url)
        if soup:
            links = soup.select('a')
            seen_urls = {p['url'] for p in known_pages}
            for link in links:
                href = link.get('href', '')
                if not href or href == '#':
                    continue
                if not href.startswith('http'):
                    href = 'https://utveckling.skane.se' + href
                if href.rstrip('/') in {u.rstrip('/') for u in seen_urls}:
                    continue
                if '/soka-stod/' not in href:
                    continue
                if href in seen_urls:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                skip_titles = ['söka stöd', 'bidrag att söka', 'sök stöd', 'priser och stipendier', 'eu-program', 'när du fått bidrag']
                if title.lower() in skip_titles:
                    continue

                seen_urls.add(href)
                raw = {
                    'title': title,
                    'url': href,
                    'description': '',
                    'eligibility': '',
                    'amount_text': '',
                    'status_text': '',
                    'deadline_text': '',
                    'category': self.default_category,
                }
                grants_data.append(raw)
                print(f"  Found: {title[:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        if 'skåne' not in [g.lower() for g in grant['target_group']]:
            grant['target_group'].append('skåne')
        return grant


if __name__ == "__main__":
    scraper = RegionSkaneScraper()
    scraper.scrape()
