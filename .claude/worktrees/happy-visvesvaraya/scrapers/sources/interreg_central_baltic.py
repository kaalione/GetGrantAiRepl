import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InterregCentralBalticScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://centralbaltic.eu/"
        self.source_name = "Interreg Central Baltic"
        self.organization = "Interreg Central Baltic"
        self.default_category = "eu"
        self.applicants_url = "https://centralbaltic.eu/for-applicants/"
        self.calendar_url = "https://centralbaltic.eu/for-applicants/call-calendar/"
        self.default_eligibility = "offentliga och privata organisationer i Sverige, Finland, Estland, Lettland"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page_playwright(self.calendar_url)
        if not soup:
            soup = self.fetch_page(self.calendar_url)

        if soup:
            self._extract_calls_from_page(soup, grants_data, seen_urls)

        self.rate_limit()

        app_soup = self.fetch_page_playwright(self.applicants_url)
        if not app_soup:
            app_soup = self.fetch_page(self.applicants_url)

        if app_soup:
            self._extract_calls_from_page(app_soup, grants_data, seen_urls)

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

            if any(kw in href.lower() for kw in ['call', 'apply', 'applicant', 'project', 'funding']):
                if not href.startswith('http'):
                    href = self.base_url.rstrip('/') + '/' + href.lstrip('/')

                if 'centralbaltic.eu' not in href and not href.startswith(self.base_url):
                    continue

                if href in seen_urls:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                if title.lower() in ['for applicants', 'call calendar', 'home', 'contact']:
                    continue

                seen_urls.add(href)

                parent = link.find_parent(['li', 'div', 'article', 'section', 'tr'])
                status_text = ''
                deadline_text = ''
                if parent:
                    parent_text = parent.get_text(' ', strip=True)
                    status_match = re.search(r'(open|closed|upcoming|öppen|stängd|kommande)', parent_text, re.IGNORECASE)
                    if status_match:
                        status_text = status_match.group(1)
                    date_match = re.search(r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{4})', parent_text)
                    if date_match:
                        deadline_text = date_match.group(1)
                    else:
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

    def _get_known_programs(self):
        base = self.base_url.rstrip('/')
        programs = [
            {
                'title': 'Interreg Central Baltic - Innovativa samhällen',
                'url': f'{base}/for-applicants/#innovative',
                'description': 'Stöd för gränsöverskridande samarbetsprojekt som stärker innovation och forskning i Central Baltic-regionen. Omfattar östra Sverige (Stockholm, Gotland), Finland, Estland och Lettland.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Central Baltic - Hållbar miljö',
                'url': f'{base}/for-applicants/#environment',
                'description': 'Stöd för projekt inom miljöskydd och hållbar användning av naturresurser i Östersjöregionen. Fokus på vattenkvalitet, biologisk mångfald och klimatanpassning.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Central Baltic - Tillgängliga och sammankopplade regioner',
                'url': f'{base}/for-applicants/#connected',
                'description': 'Stöd för projekt som förbättrar tillgänglighet och transport i Central Baltic-regionen. Gränsöverskridande samarbeten för bättre konnektivitet.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Central Baltic - Socialt inkluderande samhällen',
                'url': f'{base}/for-applicants/#social',
                'description': 'Stöd för projekt som främjar social inkludering, utbildning och arbetsmarknad i Central Baltic-regionen.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 80% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Central Baltic - Programinformation för sökande',
                'url': f'{base}/for-applicants/',
                'description': 'Övergripande information om Interreg Central Baltic-programmet 2021-2027. Programmet stödjer gränsöverskridande samarbete mellan Sverige (Stockholm, Gotland), Finland, Estland och Lettland.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
        ]
        return programs


if __name__ == "__main__":
    scraper = InterregCentralBalticScraper()
    scraper.scrape()
