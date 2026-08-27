import sys
import os
import re
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper
from utils.db import get_grant_urls_by_source


DEDUP_SOURCES = ['Business Finland', 'ELY-keskus', 'Starttiraha']


class SuomiFiScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.suomi.fi/company/financing-a-business-and-business-subsidies/aid-and-subsidies"
        self.source_name = "Suomi.fi"
        self.market = 'fi'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Digi- ja väestötietovirasto"
        self.default_category = "general"
        self.headers['Accept-Language'] = 'fi-FI,fi;q=0.9,en;q=0.5'

    def fetch_grants(self):
        grants_data = []

        existing_urls = set()
        for source_name in DEDUP_SOURCES:
            existing_urls.update(get_grant_urls_by_source(source_name))

        soup = self.fetch_page(self.base_url)
        if not soup:
            print("  Could not fetch Suomi.fi page, trying Finnish version")
            soup = self.fetch_page("https://www.suomi.fi/yritykselle/yrityksen-rahoitus-ja-yritystuet/avustukset-ja-tuet")

        if not soup:
            print("  Could not fetch Suomi.fi")
            return grants_data

        main = soup.find('main') or soup

        links = main.find_all('a', href=True)
        seen_urls = set()

        for link in links:
            href = link.get('href', '')
            if not href.startswith('http'):
                if href.startswith('/'):
                    href = 'https://www.suomi.fi' + href
                else:
                    continue

            text = link.get_text(strip=True)
            if not text or len(text) < 5:
                continue

            if href in seen_urls or href in existing_urls:
                continue

            if any(w in href.lower() for w in ['avustus', 'tuki', 'rahoitus', 'grant', 'subsid', 'aid', 'funding']):
                seen_urls.add(href)

                is_external = 'suomi.fi' not in href
                description = ''

                parent = link.find_parent(['li', 'div', 'article'])
                if parent:
                    desc_el = parent.find('p')
                    if desc_el:
                        description = desc_el.get_text(strip=True)

                if not description and not is_external:
                    self.rate_limit(1)
                    detail = self._fetch_detail_page(href)
                    if detail:
                        description = detail.get('description', '')

                if description or is_external:
                    grants_data.append({
                        'title': text,
                        'url': href,
                        'description': description or f'Avustus tai tuki yrityksille: {text}',
                        'deadline_text': None,
                        'amount_text': '',
                        'status_text': 'avoin',
                        'eligibility': '',
                    })
                    print(f"  Found: {text[:60]}")

        cards = main.find_all(['article', 'div'], class_=lambda c: c and any(
            w in str(c).lower() for w in ['card', 'service', 'item', 'result']
        ))

        for card in cards:
            card_link = card.find('a', href=True)
            if not card_link:
                continue

            href = card_link.get('href', '')
            if not href.startswith('http'):
                href = 'https://www.suomi.fi' + href

            if href in seen_urls or href in existing_urls:
                continue
            seen_urls.add(href)

            title = card_link.get_text(strip=True)
            desc_el = card.find('p')
            description = desc_el.get_text(strip=True) if desc_el else ''

            if title and len(title) > 5:
                grants_data.append({
                    'title': title,
                    'url': href,
                    'description': description or f'Avustus tai tuki yrityksille: {title}',
                    'deadline_text': None,
                    'amount_text': '',
                    'status_text': 'avoin',
                    'eligibility': '',
                })
                print(f"  Found card: {title[:60]}")

        print(f"  Total Suomi.fi grants (after dedup): {len(grants_data)}")
        return grants_data

    def _fetch_detail_page(self, url):
        soup = self.fetch_page(url)
        if not soup:
            return None

        result = {}
        main = soup.find('main') or soup.find('article') or soup

        paragraphs = main.find_all('p')
        desc_parts = []
        for p in paragraphs[:10]:
            ptext = p.get_text(strip=True)
            if ptext and len(ptext) > 20:
                desc_parts.append(ptext)
        if desc_parts:
            result['description'] = ' '.join(desc_parts[:6])

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'fi'
        grant['language'] = 'fi'
        grant['source_type'] = 'aggregaattori'

        return grant
