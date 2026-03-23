import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class KulturradetScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.kulturradet.se/sok-bidrag/"
        self.source_name = "Kulturrådet"
        self.organization = "Kulturrådet"
        self.default_category = "culture"

    def fetch_grants(self):
        grants_data = []
        soup = self.fetch_page(self.base_url)
        if not soup:
            raise Exception("Failed to fetch Kulturrådet listing page")

        skip_texts = [
            'sök bidrag', 'rutnät', 'lista', 'årsöversikt',
            'öppen för ansökan', 'kommande', 'stängd för ansökan',
            'beviljade bidrag', 'kontakt', 'om oss', 'nyheter',
            'faq', 'logga in', 'english', 'lättläst',
        ]

        links = soup.select('a[href*="/sok-bidrag/"]')

        seen_urls = set()
        max_grants = 25

        for link in links:
            if len(grants_data) >= max_grants:
                break

            href = link.get('href', '')
            if not href or href == '#':
                continue

            if not href.startswith('http'):
                href = 'https://www.kulturradet.se' + href

            if href.rstrip('/') == self.base_url.rstrip('/'):
                continue

            from urllib.parse import urlparse
            parsed = urlparse(href)
            path = parsed.path.rstrip('/')
            if not path.startswith('/sok-bidrag/'):
                continue
            subpath = path[len('/sok-bidrag/'):]
            if not subpath or '/' not in subpath and len(subpath) < 3:
                continue

            if href in seen_urls:
                continue
            seen_urls.add(href)

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            if title.lower().strip() in skip_texts:
                continue
            if any(skip == title.lower().strip() for skip in skip_texts):
                continue

            parent = link.find_parent(['li', 'div', 'article', 'tr', 'section'])
            status_text = ''
            deadline_text = ''
            if parent:
                parent_text = parent.get_text(' ', strip=True)
                status_match = re.search(r'(öppen|stängd|avslutad|pågående)', parent_text, re.IGNORECASE)
                if status_match:
                    status_text = status_match.group(1)
                date_match = re.search(r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})', parent_text, re.IGNORECASE)
                if date_match:
                    deadline_text = date_match.group(1)

            raw = {
                'title': title,
                'url': href,
                'description': '',
                'eligibility': '',
                'amount_text': '',
                'status_text': status_text,
                'deadline_text': deadline_text,
                'category': self.default_category,
            }

            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        culture_keywords = ['kultur', 'konst', 'musik', 'teater', 'film', 'litteratur']
        for kw in culture_keywords:
            if kw in f"{raw_data.get('title', '')} {raw_data.get('description', '')}".lower():
                if kw not in grant['keywords']:
                    grant['keywords'].append(kw)
        return grant


if __name__ == "__main__":
    scraper = KulturradetScraper()
    scraper.scrape()
