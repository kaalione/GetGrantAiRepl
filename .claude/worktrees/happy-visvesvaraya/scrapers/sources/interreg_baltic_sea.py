import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InterregBalticSeaScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://interreg-baltic.eu/"
        self.source_name = "Interreg Baltic Sea"
        self.organization = "Interreg Baltic Sea Region"
        self.default_category = "eu"
        self.gateway_url = "https://interreg-baltic.eu/gateway/"
        self.default_eligibility = "offentliga och privata organisationer i Östersjöregionen"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page_playwright(self.gateway_url)
        if not soup:
            soup = self.fetch_page(self.gateway_url)

        if soup:
            self._extract_calls_from_page(soup, grants_data, seen_urls)

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

            if any(kw in href.lower() for kw in ['call', 'apply', 'applicant', 'project', 'gateway', 'funding']):
                if not href.startswith('http'):
                    href = self.base_url.rstrip('/') + '/' + href.lstrip('/')

                if href in seen_urls:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                if title.lower() in ['home', 'gateway', 'contact', 'about', 'news']:
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
        links = soup.select('a[href*="call"], a[href*="apply"], a[href*="gateway"], a[href*="project"]')
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
                'title': 'Interreg Baltic Sea - Innovativa samhällen',
                'url': f'{base}/gateway/#innovative',
                'description': 'Stöd för transnationella samarbetsprojekt som stärker innovation och forskning i Östersjöregionen. Programmet omfattar hela Sverige och alla länder kring Östersjön.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Baltic Sea - Vattensmarta samhällen',
                'url': f'{base}/gateway/#water',
                'description': 'Stöd för projekt som bidrar till bättre vattenhantering och vattenkvalitet i Östersjön. Fokus på hållbar vattenförvaltning och minskning av föroreningar.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Baltic Sea - Klimatneutrala samhällen',
                'url': f'{base}/gateway/#climate',
                'description': 'Stöd för projekt inom klimatanpassning och klimatneutralitet i Östersjöregionen. Fokus på förnybar energi, energieffektivitet och cirkulär ekonomi.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Baltic Sea - Samarbetsstyrning',
                'url': f'{base}/gateway/#governance',
                'description': 'Stöd för projekt som stärker samarbetsstyrning och institutionell kapacitet i Östersjöregionen. Fokus på makroregional samverkan och kapacitetsbyggande.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Baltic Sea Region - Gateway för sökande',
                'url': f'{base}/gateway/',
                'description': 'Övergripande information om Interreg Baltic Sea Region-programmet 2021-2027. Programmet stödjer transnationellt samarbete i hela Östersjöregionen och omfattar alla svenska regioner.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
        ]
        return programs


if __name__ == "__main__":
    scraper = InterregBalticSeaScraper()
    scraper.scrape()
