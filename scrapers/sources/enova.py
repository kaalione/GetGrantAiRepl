import sys
import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class EnovaScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.enova.no/nb/bedrift/"
        self.source_name = "Enova"
        self.organization = "Enova SF"
        self.default_category = "energy"
        self.headers['Accept-Language'] = 'nb-NO,nb;q=0.9,no;q=0.8'

        self.sector_pages = [
            'https://www.enova.no/nb/bedrift/industri/',
            'https://www.enova.no/nb/bedrift/sjotransport/',
            'https://www.enova.no/nb/bedrift/landtransport/',
            'https://www.enova.no/nb/bedrift/bygg-og-eiendom/',
            'https://www.enova.no/nb/bedrift/energisystem/',
            'https://www.enova.no/nb/bedrift/andre-markedstilbud/',
        ]

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        all_program_links = []

        for sector_url in self.sector_pages:
            try:
                self.rate_limit(1)
                soup = self.fetch_page(sector_url)
                if not soup:
                    continue

                links = soup.find_all('a', href=True)
                for l in links:
                    href = l.get('href', '')
                    if 'stottetilbud' in href or 'støttetilbud' in href:
                        if not href.startswith('http'):
                            href = 'https://www.enova.no' + href
                        if href not in seen_urls:
                            seen_urls.add(href)
                            text = l.get_text(strip=True).replace('Les mer', '').strip()
                            if text and len(text) > 3 and not text.upper().startswith('UTGÅTT'):
                                all_program_links.append({'url': href, 'title': text})
            except Exception as e:
                print(f"  Error fetching sector page {sector_url}: {e}")

        print(f"  Found {len(all_program_links)} unique support program links")

        for i, prog in enumerate(all_program_links[:25]):
            try:
                self.rate_limit(0.5)
                detail = self._fetch_detail_page(prog['url'])
                if detail:
                    title = detail.get('title') or prog['title']

                    grant_data = {
                        'title': title,
                        'url': prog['url'],
                        'description': detail.get('description', ''),
                        'deadline_text': detail.get('deadline'),
                        'amount_text': detail.get('amount', ''),
                        'status_text': 'åpen',
                        'eligibility': detail.get('eligibility', ''),
                    }
                    grants_data.append(grant_data)
                    print(f"  [{i+1}/{len(all_program_links)}] Scraped: {title[:50]}")
                else:
                    print(f"  [{i+1}/{len(all_program_links)}] No detail for: {prog['title'][:50]}")
            except Exception as e:
                print(f"  Error scraping {prog['url']}: {e}")

        return grants_data

    def _fetch_detail_page(self, url):
        soup = self.fetch_page(url)
        if not soup:
            return None

        result = {}

        h1 = soup.find('h1')
        if h1:
            result['title'] = h1.get_text(strip=True)

        main = soup.find('main') or soup.find('article') or soup

        paragraphs = main.find_all('p')
        desc_parts = []
        for p in paragraphs[:12]:
            ptext = p.get_text(strip=True)
            if ptext and len(ptext) > 20:
                desc_parts.append(ptext)
        if desc_parts:
            result['description'] = ' '.join(desc_parts[:8])

        eligibility_parts = []
        for heading in main.find_all(['h2', 'h3']):
            heading_text = heading.get_text(strip=True).lower()
            if any(w in heading_text for w in ['hvem kan søke', 'krav', 'vilkår', 'forutsetning', 'kriterier', 'målgruppe']):
                sibling = heading.find_next_sibling()
                while sibling and sibling.name not in ['h2', 'h3']:
                    text = sibling.get_text(strip=True)
                    if text:
                        eligibility_parts.append(text)
                    sibling = sibling.find_next_sibling()

        if eligibility_parts:
            result['eligibility'] = ' '.join(eligibility_parts[:5])

        full_text = main.get_text()
        amount_patterns = [
            r'(?:inntil|opptil|opp til|maksimalt?)\s+((?:NOK\s+)?[\d\s,.]+(?:\s*(?:kroner|kr|mill|million))?)',
            r'støtteandel[^.]*?(\d+\s*%)',
            r'([\d\s,.]+)\s*(?:kroner|kr|MNOK)',
        ]
        for pat in amount_patterns:
            match = re.search(pat, full_text, re.IGNORECASE)
            if match:
                result['amount'] = match.group(0)
                break

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'no'
        grant['language'] = 'nb'
        grant['source_type'] = 'myndighet'

        if not grant.get('keywords'):
            grant['keywords'] = []
        energy_keywords = ['energi', 'klima', 'miljø', 'fornybar', 'utslipp', 'bærekraft']
        for kw in energy_keywords:
            if kw not in grant['keywords']:
                grant['keywords'].append(kw)
        grant['keywords'] = grant['keywords'][:15]

        return grant
