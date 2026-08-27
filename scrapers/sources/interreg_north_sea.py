import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InterregNorthSeaScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.interregnorthsea.eu/"
        self.source_name = "Interreg North Sea"
        self.market = 'eu'  # EU-omfattande program — synligt i alla marknader
        self.organization = "Interreg North Sea Region"
        self.default_category = "eu"
        self.future_calls_url = "https://www.interregnorthsea.eu/future-calls"
        self.apply_url = "https://www.interregnorthsea.eu/apply"
        self.default_eligibility = "offentliga och privata organisationer i Nordsjöregionen"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page_playwright(self.future_calls_url)
        if not soup:
            soup = self.fetch_page(self.future_calls_url)

        if soup:
            self._extract_calls_from_page(soup, grants_data, seen_urls)

        self.rate_limit()

        apply_soup = self.fetch_page_playwright(self.apply_url)
        if not apply_soup:
            apply_soup = self.fetch_page(self.apply_url)

        if apply_soup:
            self._extract_calls_from_page(apply_soup, grants_data, seen_urls)

        self.rate_limit()

        main_soup = self.fetch_page_playwright(self.base_url)
        if not main_soup:
            main_soup = self.fetch_page(self.base_url)

        if main_soup:
            self._discover_call_links(main_soup, grants_data, seen_urls)

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] in seen_urls:
                continue
            seen_urls.add(prog['url'])
            grants_data.append(prog)
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _extract_calls_from_page(self, soup, grants_data, seen_urls):
        links = soup.select('a[href]')
        for link in links:
            href = link.get('href', '')
            if not href or href == '#' or href.startswith('mailto:') or href.startswith('tel:'):
                continue

            if any(kw in href.lower() for kw in ['call', 'apply', 'project', 'funding', 'priority']):
                if not href.startswith('http'):
                    href = self.base_url.rstrip('/') + '/' + href.lstrip('/')

                if href in seen_urls:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                if title.lower() in ['home', 'apply', 'future calls', 'contact', 'about']:
                    continue

                seen_urls.add(href)

                parent = link.find_parent(['li', 'div', 'article', 'section', 'tr'])
                status_text = ''
                deadline_text = ''
                if parent:
                    parent_text = parent.get_text(' ', strip=True)
                    status_match = re.search(r'(open|closed|upcoming|planned)', parent_text, re.IGNORECASE)
                    if status_match:
                        status_text = status_match.group(1)
                    date_match = re.search(r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{4})', parent_text)
                    if not date_match:
                        date_match = re.search(r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})', parent_text, re.IGNORECASE)
                    if date_match:
                        deadline_text = date_match.group(1)

                raw = {
                    'title': title,
                    'url': href,
                    'description': '',
                    'eligibility': self.default_eligibility,
                    'amount_text': '',
                    'status_text': status_text,
                    'deadline_text': deadline_text,
                    'category': self.default_category,
                }
                grants_data.append(raw)
                print(f"  Found: {title[:60]}")

    def _discover_call_links(self, soup, grants_data, seen_urls):
        links = soup.select('a[href*="call"], a[href*="apply"], a[href*="project"], a[href*="priority"]')
        for link in links:
            href = link.get('href', '')
            if not href.startswith('http'):
                href = self.base_url.rstrip('/') + '/' + href.lstrip('/')
            if href in seen_urls:
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            seen_urls.add(href)
            raw = {
                'title': title,
                'url': href,
                'description': '',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': '',
                'deadline_text': '',
                'category': self.default_category,
            }
            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

    def _get_known_programs(self):
        base = self.base_url.rstrip('/')
        programs = [
            {
                'title': 'Interreg North Sea - Grön omställning',
                'url': f'{base}/future-calls#green',
                'description': 'Stöd för gränsöverskridande samarbetsprojekt inom grön omställning i Nordsjöregionen. Fokus på klimatanpassning, förnybar energi och cirkulär ekonomi. Programmet omfattar västra Sverige och Nordsjöländerna.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 60% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg North Sea - Digital innovation',
                'url': f'{base}/future-calls#digital',
                'description': 'Stöd för projekt inom digital innovation och smart specialisering i Nordsjöregionen. Gränsöverskridande samarbete för digitalisering och teknologiutveckling.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 60% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg North Sea - Smart specialisering',
                'url': f'{base}/future-calls#smart',
                'description': 'Stöd för projekt inom smart specialisering som stärker regionala styrkor och innovationssystem i Nordsjöregionen.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 60% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg North Sea - Ansök om stöd',
                'url': f'{base}/apply',
                'description': 'Information om hur man ansöker om stöd från Interreg North Sea Region-programmet. Programmet stödjer transnationellt samarbete mellan länder kring Nordsjön.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg North Sea Region - Programinformation',
                'url': f'{base}/future-calls',
                'description': 'Övergripande information om Interreg North Sea Region-programmet 2021-2027. Programmet stödjer transnationellt samarbete i Nordsjöregionen inklusive västra Sverige.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
        ]
        return programs


if __name__ == "__main__":
    scraper = InterregNorthSeaScraper()
    scraper.scrape()
