import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InternetstiftelsenScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://internetstiftelsen.se/"
        self.source_name = "Internetstiftelsen"
        self.organization = "Internetstiftelsen"
        self.default_category = "digital"

    def fetch_grants(self):
        grants_data = []

        pages = [
            "https://internetstiftelsen.se/kunskap/for-samhallet/internetstiftelsen-stottar/",
            "https://internetstiftelsen.se/",
        ]

        seen_urls = set()

        for page_url in pages:
            self.rate_limit()
            soup = self.fetch_page(page_url)
            if not soup:
                continue

            links = soup.select('a[href]')
            for link in links:
                href = link.get('href', '')
                text = link.get_text(strip=True)
                if not href or href == '#' or not text or len(text) < 5:
                    continue

                combined = (href + ' ' + text).lower()
                if not any(w in combined for w in ['stöd', 'fond', 'bidrag', 'ansök', 'grant', 'finansier']):
                    continue

                if not href.startswith('http'):
                    href = 'https://internetstiftelsen.se' + href
                if 'internetstiftelsen.se' not in href:
                    continue
                if href in seen_urls:
                    continue
                seen_urls.add(href)

                skip = ['cookie', 'integritetspolicy', 'kontakt', 'press', 'jobb']
                if any(s in href.lower() for s in skip):
                    continue

                self.rate_limit()
                detail = self.fetch_page(href)
                description = ''
                eligibility = ''
                amount_text = ''
                deadline_text = ''

                if detail:
                    desc_elem = detail.select_one('article, .main-content, main, .content')
                    if desc_elem:
                        paragraphs = desc_elem.find_all('p')
                        description = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

                    page_text = detail.get_text(' ', strip=True)

                    amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
                    if amount_match:
                        amount_text = amount_match.group(1)

                    date_match = re.search(
                        r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                        page_text, re.IGNORECASE
                    )
                    if date_match:
                        deadline_text = date_match.group(1)

                    for heading in detail.select('h2, h3, h4'):
                        h_text = heading.get_text(strip=True).lower()
                        if any(w in h_text for w in ['vem kan söka', 'vem kan få', 'vilka kan', 'målgrupp', 'krav']):
                            sibling = heading.find_next_sibling()
                            parts = []
                            while sibling and sibling.name not in ['h2', 'h3', 'h4']:
                                t = sibling.get_text(strip=True)
                                if t:
                                    parts.append(t)
                                sibling = sibling.find_next_sibling()
                            if parts:
                                eligibility = ' '.join(parts)
                                break

                raw = {
                    'title': text,
                    'url': href,
                    'description': description,
                    'eligibility': eligibility,
                    'amount_text': amount_text,
                    'status_text': 'open',
                    'deadline_text': deadline_text,
                    'category': self.default_category,
                }
                grants_data.append(raw)
                print(f"  Found: {text[:60]}")

        if not grants_data:
            print("  Note: Internetstiftelsen has discontinued open grant programs (Internetfonden closed)")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'stiftelse'
        digital_keywords = ['internet', 'digital', 'it', 'teknologi']
        for kw in digital_keywords:
            if kw not in grant['keywords']:
                grant['keywords'].append(kw)
        return grant


if __name__ == "__main__":
    scraper = InternetstiftelsenScraper()
    scraper.scrape()
