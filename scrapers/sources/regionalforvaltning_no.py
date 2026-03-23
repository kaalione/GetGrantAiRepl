import sys
import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class RegionalforvaltningNoScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.regionalforvaltning.no/"
        self.source_name = "Regionalforvaltning.no"
        self.organization = "Norske fylkeskommuner"
        self.default_category = "regional"
        self.headers['Accept-Language'] = 'nb-NO,nb;q=0.9,no;q=0.8'

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if not soup:
            print("  Failed to fetch main page, trying alternate URLs")
            for alt_url in [
                'https://www.regionalforvaltning.no/Startside/Tilskudd.aspx',
                'https://www.regionalforvaltning.no/Startside/Soknadsordninger.aspx',
            ]:
                soup = self.fetch_page(alt_url)
                if soup:
                    break

        if soup:
            grants_data.extend(self._parse_listing(soup, seen_urls))

        search_urls = [
            'https://www.regionalforvaltning.no/Startside/Tilskudd.aspx',
            'https://www.regionalforvaltning.no/Startside/Soknadsordninger.aspx',
        ]
        for url in search_urls:
            try:
                self.rate_limit(1)
                sub_soup = self.fetch_page(url)
                if sub_soup:
                    grants_data.extend(self._parse_listing(sub_soup, seen_urls))
            except Exception as e:
                print(f"  Error fetching {url}: {e}")

        if not grants_data:
            grants_data = self._scrape_fylkeskommune_pages(seen_urls)

        print(f"  Total grants found: {len(grants_data)}")
        return grants_data

    def _parse_listing(self, soup, seen_urls):
        grants = []

        links = soup.find_all('a', href=True)
        for l in links:
            href = l.get('href', '')
            text = l.get_text(strip=True)

            is_grant_link = (
                'tilskudd' in href.lower()
                or 'soknadsordning' in href.lower()
                or 'søknadsordning' in href.lower()
                or ('ordning' in href.lower() and 'id=' in href.lower())
            )

            if not is_grant_link or not text or len(text) < 5:
                continue

            if not href.startswith('http'):
                href = 'https://www.regionalforvaltning.no' + href

            if href in seen_urls:
                continue
            seen_urls.add(href)

            grant_data = {
                'title': text,
                'url': href,
                'description': '',
                'deadline_text': None,
                'amount_text': '',
                'status_text': 'åpen',
                'eligibility': '',
            }
            grants.append(grant_data)

        for row in soup.select('tr, .listing-item, .grant-item, .ordning'):
            cells = row.find_all(['td', 'span', 'div'])
            if len(cells) >= 2:
                link = row.find('a', href=True)
                if link:
                    href = link.get('href', '')
                    if not href.startswith('http'):
                        href = 'https://www.regionalforvaltning.no' + href
                    if href in seen_urls:
                        continue
                    seen_urls.add(href)
                    title = link.get_text(strip=True)
                    desc_parts = [c.get_text(strip=True) for c in cells[1:] if c.get_text(strip=True)]

                    grants.append({
                        'title': title,
                        'url': href,
                        'description': ' | '.join(desc_parts) if desc_parts else '',
                        'deadline_text': None,
                        'amount_text': '',
                        'status_text': 'åpen',
                        'eligibility': '',
                    })

        return grants

    def _scrape_fylkeskommune_pages(self, seen_urls):
        grants = []
        fylker = [
            ('Troms og Finnmark', 'https://www.tffk.no'),
            ('Nordland', 'https://www.nfk.no'),
            ('Trøndelag', 'https://www.trondelagfylke.no'),
            ('Møre og Romsdal', 'https://www.mrfylke.no'),
            ('Vestland', 'https://www.vestlandfylke.no'),
            ('Rogaland', 'https://www.rogfk.no'),
            ('Agder', 'https://www.agderfk.no'),
            ('Vestfold og Telemark', 'https://www.vtfk.no'),
            ('Viken', 'https://www.viken.no'),
            ('Innlandet', 'https://www.innlandetfylke.no'),
        ]

        for fylke_name, base in fylker[:5]:
            try:
                self.rate_limit(1)
                for path in ['/naeringsliv/tilskudd/', '/naering/tilskudd/', '/naeringsliv/']:
                    try:
                        url = base + path
                        soup = self.fetch_page(url)
                        if soup:
                            links = soup.find_all('a', href=True)
                            for l in links:
                                href = l.get('href', '')
                                text = l.get_text(strip=True)
                                if any(w in href.lower() for w in ['tilskudd', 'støtte', 'fond', 'næring']):
                                    if not href.startswith('http'):
                                        href = base + href
                                    if href not in seen_urls and text and len(text) > 5:
                                        seen_urls.add(href)
                                        grants.append({
                                            'title': f"{text} ({fylke_name})",
                                            'url': href,
                                            'description': f"Regionalt stöd från {fylke_name} fylkeskommune.",
                                            'deadline_text': None,
                                            'amount_text': '',
                                            'status_text': 'åpen',
                                            'eligibility': f"Bedrifter i {fylke_name}.",
                                        })
                            break
                    except:
                        continue
            except Exception as e:
                print(f"  Error scraping {fylke_name}: {e}")

        return grants

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'no'
        grant['language'] = 'nb'
        grant['source_type'] = 'regional'
        return grant
