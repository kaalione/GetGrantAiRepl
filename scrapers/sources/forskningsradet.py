import sys
import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class ForskningsradetScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.forskningsradet.no/utlysninger/"
        self.source_name = "Forskningsrådet"
        self.market = 'no'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Norges forskningsråd"
        self.default_category = "research"
        self.headers['Accept-Language'] = 'nb-NO,nb;q=0.9,no;q=0.8'

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if not soup:
            print("  Failed to fetch listing page")
            return grants_data

        proposals = soup.select('.proposal')
        print(f"  Found {len(proposals)} proposal blocks on listing page")

        for proposal in proposals:
            try:
                link_el = proposal.select_one('.proposal--right a[href]')
                if not link_el:
                    link_el = proposal.select_one('a[href*="/utlysninger/"]')
                if not link_el:
                    continue

                href = link_el.get('href', '')
                if not href or href == '/utlysninger/':
                    continue

                if not href.startswith('http'):
                    href = 'https://www.forskningsradet.no' + href

                if href in seen_urls:
                    continue
                seen_urls.add(href)

                title = link_el.get_text(strip=True)
                if not title:
                    continue

                text_content = proposal.get_text(separator='|', strip=True)

                deadline_text = self._extract_field(text_content, 'Søknadsfrist')
                amount_text = self._extract_field(text_content, 'Antatt tilgjengelige midler')
                support_text = self._extract_field(text_content, 'Støttegrenser')
                duration_text = self._extract_field(text_content, 'Prosjektvarighet')
                purpose_text = self._extract_field(text_content, 'Formål')

                status_text = None
                if 'Søk nå' in text_content:
                    status_text = 'åpen'
                elif 'Se Resultat' in text_content:
                    status_text = 'avsluttet'
                elif 'Lukket' in text_content or 'Stengt' in text_content:
                    status_text = 'stengt'
                elif 'Løpende' in text_content:
                    status_text = 'åpen'

                combined_amount = ' '.join(filter(None, [amount_text, support_text]))

                description_parts = []
                if purpose_text:
                    description_parts.append(purpose_text)
                if combined_amount:
                    description_parts.append(f"Tilgjengelige midler: {combined_amount}")
                if duration_text:
                    description_parts.append(f"Prosjektvarighet: {duration_text}")

                grant_data = {
                    'title': title,
                    'url': href,
                    'description': ' '.join(description_parts) if description_parts else '',
                    'deadline_text': deadline_text if deadline_text and deadline_text != 'Løpende' else None,
                    'amount_text': combined_amount,
                    'status_text': status_text,
                    'eligibility': '',
                }

                grants_data.append(grant_data)

            except Exception as e:
                print(f"  Error parsing proposal: {e}")
                continue

        print(f"  Parsed {len(grants_data)} grants from listing page")

        for i, grant in enumerate(grants_data[:50]):
            try:
                self.rate_limit(1)
                detail = self._fetch_detail_page(grant['url'])
                if detail:
                    if detail.get('description') and len(detail['description']) > len(grant.get('description', '')):
                        grant['description'] = detail['description']
                    if detail.get('eligibility'):
                        grant['eligibility'] = detail['eligibility']
                    if detail.get('deadline_text') and not grant.get('deadline_text'):
                        grant['deadline_text'] = detail['deadline_text']
                    if detail.get('amount_text') and not grant.get('amount_text'):
                        grant['amount_text'] = detail['amount_text']
                print(f"  [{i+1}/{len(grants_data)}] Enriched: {grant['title'][:50]}")
            except Exception as e:
                print(f"  Error fetching detail for {grant['title'][:40]}: {e}")

        return grants_data

    def _extract_field(self, text, field_name):
        parts = text.split('|')
        for i, part in enumerate(parts):
            if field_name in part:
                values = []
                for j in range(i + 1, min(i + 4, len(parts))):
                    next_part = parts[j].strip()
                    if any(kw in next_part for kw in ['Søknadsfrist', 'Antatt', 'Støttegrenser', 'Prosjektvarighet', 'Formål', 'Søk nå', 'Se Resultat']):
                        break
                    if next_part:
                        values.append(next_part)
                return ' '.join(values) if values else None
        return None

    def _fetch_detail_page(self, url):
        soup = self.fetch_page(url)
        if not soup:
            return None

        result = {}

        main = soup.find('main') or soup.find('article') or soup
        paragraphs = main.find_all('p')
        desc_parts = []
        for p in paragraphs[:15]:
            text = p.get_text(strip=True)
            if text and len(text) > 30:
                desc_parts.append(text)
        if desc_parts:
            result['description'] = ' '.join(desc_parts[:8])

        eligibility_parts = []
        for heading in main.find_all(['h2', 'h3']):
            heading_text = heading.get_text(strip=True).lower()
            if any(w in heading_text for w in ['hvem kan søke', 'krav til søker', 'forutsetninger', 'målgruppe']):
                sibling = heading.find_next_sibling()
                while sibling and sibling.name not in ['h2', 'h3']:
                    text = sibling.get_text(strip=True)
                    if text:
                        eligibility_parts.append(text)
                    sibling = sibling.find_next_sibling()

        if eligibility_parts:
            result['eligibility'] = ' '.join(eligibility_parts[:5])

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'no'
        grant['language'] = 'nb'
        grant['source_type'] = 'myndighet'
        return grant
