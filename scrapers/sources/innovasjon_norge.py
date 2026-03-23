import sys
import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InnovasjonNorgeScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.innovasjonnorge.no/artikkel/tilskudd"
        self.source_name = "Innovasjon Norge"
        self.organization = "Innovasjon Norge"
        self.default_category = "innovation"
        self.headers['Accept-Language'] = 'nb-NO,nb;q=0.9,no;q=0.8'

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if not soup:
            print("  Failed to fetch listing page")
            return grants_data

        links = soup.find_all('a', href=True)
        service_links = []
        for l in links:
            href = l.get('href', '')
            if href.startswith('/tjeneste/') and href != '/tjeneste/':
                full_url = 'https://www.innovasjonnorge.no' + href
                if full_url not in seen_urls:
                    seen_urls.add(full_url)
                    text = l.get_text(strip=True)
                    if text and len(text) > 3:
                        service_links.append({'url': full_url, 'title': text})

        print(f"  Found {len(service_links)} unique service links")

        for i, svc in enumerate(service_links):
            try:
                self.rate_limit(1.5)
                detail = self._fetch_detail_page(svc['url'])
                if detail:
                    title = detail.get('title') or svc['title']
                    title = re.sub(r'^(.{60,}?)(?=[A-ZÆØÅ][a-zæøå])', r'\1', title).strip()
                    if len(title) > 200:
                        title = title[:200]

                    grant_data = {
                        'title': title,
                        'url': svc['url'],
                        'description': detail.get('description', ''),
                        'deadline_text': detail.get('deadline'),
                        'amount_text': detail.get('amount', ''),
                        'status_text': detail.get('status'),
                        'eligibility': detail.get('eligibility', ''),
                    }
                    grants_data.append(grant_data)
                    print(f"  [{i+1}/{len(service_links)}] Scraped: {title[:50]}")
                else:
                    print(f"  [{i+1}/{len(service_links)}] No detail for: {svc['title'][:50]}")
            except Exception as e:
                print(f"  Error scraping {svc['url']}: {e}")

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

        intro = soup.select_one('.intro, .lead, .preamble, .ingress, [class*=intro], [class*=lead]')
        if intro:
            result['description'] = intro.get_text(strip=True)

        meta = soup.find('meta', attrs={'name': 'description'})
        if meta and meta.get('content') and not result.get('description'):
            result['description'] = meta['content']

        h1 = soup.find('h1')
        if h1:
            desc_parts = []
            boilerplate_markers = ['ansvarlig næringsliv', 'statsstøtteregelverket', 'cookie', 'personvern']
            for el in h1.find_all_next(['p']):
                text = el.get_text(strip=True)
                if any(m in text.lower() for m in boilerplate_markers):
                    break
                if text and len(text) > 15 and not text.startswith('©'):
                    desc_parts.append(text)
                if len(desc_parts) >= 4:
                    break
            if desc_parts:
                page_desc = ' '.join(desc_parts)
                if not result.get('description') or len(page_desc) > len(result.get('description', '')):
                    result['description'] = page_desc

            for el in h1.find_all_next(['p', 'div', 'span']):
                text = el.get_text(strip=True)
                if any(m in text.lower() for m in boilerplate_markers):
                    break
                text_lower = text.lower()
                if 'søknadsfrist' in text_lower:
                    parts = text.split('Søknadsfrist')
                    if len(parts) > 1:
                        result['deadline'] = parts[1].strip()
                    else:
                        result['deadline'] = text.replace('Søknadsfrist', '').strip()
                elif 'målgruppe' in text_lower:
                    target = text.replace('Målgruppe', '').strip()
                    if target:
                        result['target_group'] = target
                        result['eligibility'] = target
                elif 'hvor mye' in text_lower or 'beløp' in text_lower:
                    amount_val = text.replace('Hvor mye', '').replace('Beløp', '').strip()
                    if amount_val:
                        result['amount'] = amount_val

        eligibility_parts = []
        for heading in main.find_all(['h2', 'h3']):
            heading_text = heading.get_text(strip=True).lower()
            if any(w in heading_text for w in ['hvem kan søke', 'krav', 'vilkår', 'forutsetning', 'kriterier']):
                sibling = heading.find_next_sibling()
                while sibling and sibling.name not in ['h2', 'h3']:
                    text = sibling.get_text(strip=True)
                    if text:
                        eligibility_parts.append(text)
                    sibling = sibling.find_next_sibling()

        if eligibility_parts:
            result['eligibility'] = ' '.join(eligibility_parts[:5])

        amount_text = ''
        full_text = main.get_text()
        amount_patterns = [
            r'(?:inntil|opptil|opp til|maksimalt?)\s+((?:NOK\s+)?[\d\s,.]+(?:\s*(?:kroner|kr|mill|million))?)',
            r'([\d\s,.]+)\s*(?:kroner|kr|MNOK)',
        ]
        for pat in amount_patterns:
            match = re.search(pat, full_text, re.IGNORECASE)
            if match:
                amount_text = match.group(0)
                break
        if amount_text:
            result['amount'] = amount_text

        result['status'] = 'åpen'

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'no'
        grant['language'] = 'nb'
        grant['source_type'] = 'myndighet'

        base_req = 'Krav: Norskregistrert aksjeselskap (AS).'
        if grant.get('eligibility_criteria') and isinstance(grant['eligibility_criteria'], dict):
            existing = grant['eligibility_criteria'].get('text', '')
            if existing and 'norskregistrert' not in existing.lower():
                grant['eligibility_criteria']['text'] = f"{base_req} {existing}"
        elif not grant.get('eligibility_criteria'):
            grant['eligibility_criteria'] = {
                'text': f'{base_req} De fleste program krever internasjonal vekstpotensial.'
            }

        return grant
