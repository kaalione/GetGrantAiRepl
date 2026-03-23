import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class NaturvardsverketScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.naturvardsverket.se/bidrag/"
        self.source_name = "Naturvårdsverket"
        self.organization = "Naturvårdsverket"
        self.default_category = "environment"

    def fetch_grants(self):
        grants_data = []

        known_programs = [
            {
                'title': 'Klimatklivet - investeringsstöd för lokala klimatinvesteringar',
                'url': 'https://www.naturvardsverket.se/bidrag/klimatklivet/',
                'category': 'climate',
            },
            {
                'title': 'LONA - Lokala naturvårdssatsningen',
                'url': 'https://www.naturvardsverket.se/bidrag/lona-lokala-naturvardssatsningen/',
                'category': 'environment',
            },
            {
                'title': 'LOVA - Lokala vattenvårdsprojekt',
                'url': 'https://www.naturvardsverket.se/bidrag/lova-lokala-vattenvardsprojekt/',
                'category': 'environment',
            },
            {
                'title': 'Stöd till sanering av förorenade områden',
                'url': 'https://www.naturvardsverket.se/bidrag/sanering-av-fororenade-omraden/',
                'category': 'environment',
            },
            {
                'title': 'Viltvårdsfonden',
                'url': 'https://www.naturvardsverket.se/bidrag/viltvardsfonden/',
                'category': 'environment',
            },
        ]

        soup = self.fetch_page_playwright(self.base_url)
        if not soup:
            soup = self.fetch_page(self.base_url)

        if soup:
            links = soup.select('a[href*="/bidrag/"]')
            if not links:
                links = soup.select('a[href*="vagledning-och-stod"]')

            seen_urls = {p['url'].rstrip('/') for p in known_programs}
            for link in links:
                href = link.get('href', '')
                if not href or href == '#':
                    continue
                if not href.startswith('http'):
                    href = 'https://www.naturvardsverket.se' + href
                if href.rstrip('/') == self.base_url.rstrip('/'):
                    continue
                if href.rstrip('/') in seen_urls:
                    continue
                seen_urls.add(href.rstrip('/'))

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue

                known_programs.append({
                    'title': title,
                    'url': href,
                    'category': self.default_category,
                })

        for program in known_programs:
            raw = {
                'title': program['title'],
                'url': program['url'],
                'description': '',
                'eligibility': '',
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': program.get('category', self.default_category),
            }

            self.rate_limit()
            detail = self.fetch_page(program['url'])
            if not detail:
                print(f"  Skipping (unreachable): {program['title'][:60]}")
                continue

            desc_elem = detail.select_one('article, .main-content, main, .content')
            if desc_elem:
                paragraphs = desc_elem.find_all('p')
                raw['description'] = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

            page_text = detail.get_text(' ', strip=True)
            date_match = re.search(
                r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                page_text, re.IGNORECASE
            )
            if date_match:
                raw['deadline_text'] = date_match.group(1)

            amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
            if amount_match:
                raw['amount_text'] = amount_match.group(1)

            window_match = re.search(r'ansökningsfönster[:\s]*([^.]+)', page_text, re.IGNORECASE)
            if window_match:
                raw['description'] += f" Ansökningsfönster: {window_match.group(1).strip()}"

            if any(w in page_text.lower() for w in ['stängd', 'avslutad']):
                raw['status_text'] = 'closed'

            grants_data.append(raw)
            print(f"  Found: {program['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        env_keywords = ['miljö', 'klimat', 'utsläpp', 'hållbarhet']
        for kw in env_keywords:
            if kw not in grant['keywords']:
                if kw in f"{raw_data.get('title', '')} {raw_data.get('description', '')}".lower():
                    grant['keywords'].append(kw)
        return grant


if __name__ == "__main__":
    scraper = NaturvardsverketScraper()
    scraper.scrape()
