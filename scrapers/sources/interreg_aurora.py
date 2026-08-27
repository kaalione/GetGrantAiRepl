import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InterregAuroraScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.interregaurora.eu/"
        self.source_name = "Interreg Aurora"
        self.market = 'eu'  # EU-omfattande program — synligt i alla marknader
        self.organization = "Interreg Aurora"
        self.default_category = "eu"
        self.calls_url = "https://www.interregaurora.eu/projects/calls-for-applications-2/"
        self.default_eligibility = "offentliga och privata organisationer i Norrland, Finland, Norge"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page_playwright(self.calls_url)
        if not soup:
            soup = self.fetch_page(self.calls_url)

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

            if any(kw in href.lower() for kw in ['call', 'application', 'apply', 'utlysning', 'project']):
                if not href.startswith('http'):
                    href = self.base_url.rstrip('/') + '/' + href.lstrip('/')

                if href in seen_urls:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                title_lower = title.lower().strip()
                skip_titles = [
                    'home', 'projects', 'contact', 'calls for applications',
                    'plan your project', 'apply for project', 'implement your project',
                    'finish your project', 'for project applicants', 'for project beneficiaries',
                    'my application', 'interreg aurora projects', 'list of operations',
                ]
                if title_lower in skip_titles:
                    continue
                if any(title_lower.startswith(s) for s in [
                    'list of approved', 'here you can', 'the budget template',
                    'project idea template', 'timetable',
                ]):
                    continue

                seen_urls.add(href)

                parent = link.find_parent(['li', 'div', 'article', 'section', 'tr', 'td'])
                status_text = ''
                deadline_text = ''
                description = ''
                if parent:
                    parent_text = parent.get_text(' ', strip=True)
                    status_match = re.search(r'(open|closed|upcoming|öppen|stängd|kommande)', parent_text, re.IGNORECASE)
                    if status_match:
                        status_text = status_match.group(1)
                    date_match = re.search(r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{4})', parent_text)
                    if not date_match:
                        date_match = re.search(r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})', parent_text, re.IGNORECASE)
                    if date_match:
                        deadline_text = date_match.group(1)
                    desc_elem = parent.find('p')
                    if desc_elem:
                        description = desc_elem.get_text(strip=True)

                raw = {
                    'title': title,
                    'url': href,
                    'description': description,
                    'eligibility': self.default_eligibility,
                    'amount_text': 'Upp till 65% EU-medfinansiering, 50% norska kostnader',
                    'status_text': status_text,
                    'deadline_text': deadline_text,
                    'category': self.default_category,
                }
                grants_data.append(raw)
                print(f"  Found: {title[:60]}")

    def _discover_call_links(self, soup, grants_data, seen_urls):
        links = soup.select('a[href*="call"], a[href*="application"], a[href*="apply"]')
        skip_prefixes = [
            'list of approved', 'here you can', 'the budget template',
            'project idea template', 'timetable', 'plan your', 'implement your',
            'finish your', 'for project',
        ]
        skip_exact = [
            'home', 'projects', 'contact', 'calls for applications',
            'apply for project', 'my application',
        ]
        for link in links:
            href = link.get('href', '')
            if not href.startswith('http'):
                href = self.base_url.rstrip('/') + '/' + href.lstrip('/')
            if href in seen_urls:
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            title_lower = title.lower().strip()
            if title_lower in skip_exact:
                continue
            if any(title_lower.startswith(s) for s in skip_prefixes):
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
                'title': 'Interreg Aurora Call 8 - Regular Projects',
                'url': f'{base}/projects/calls-for-applications-2/#call8',
                'description': 'Utlysning 8 för reguljära projekt inom Interreg Aurora-programmet. Programmet stödjer gränsöverskridande samarbete i norra Skandinavien, Finland och Norge (inklusive Sápmi). Öppen för ansökningar 9 februari - 9 mars 2026.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering, 50% norska kostnader',
                'status_text': 'open',
                'deadline_text': '9 mars 2026',
                'category': 'eu',
            },
            {
                'title': 'Interreg Aurora Call 6 - Small-Scale Projects',
                'url': f'{base}/projects/calls-for-applications-2/#call6small',
                'description': 'Utlysning 6 för småskaliga projekt inom Interreg Aurora-programmet. Mindre projekt med kortare projekttid och lägre budget. Öppen för ansökningar 9 februari - 9 mars 2026.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering, lägre budgetram för småskaliga projekt',
                'status_text': 'open',
                'deadline_text': '9 mars 2026',
                'category': 'eu',
            },
            {
                'title': 'Interreg Aurora Call 9 - Kommande utlysning',
                'url': f'{base}/projects/calls-for-applications-2/#call9',
                'description': 'Kommande utlysning 9 inom Interreg Aurora-programmet. Planerad öppning september-oktober 2026.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'kommande',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Aurora - Forskning & Innovation',
                'url': f'{base}/projects/calls-for-applications-2/#research',
                'description': 'Prioriterat område: Forskning och innovation. Stöd för gränsöverskridande forsknings- och innovationsprojekt som stärker konkurrenskraften i Aurora-regionen (Norrland, Finland, Norge).',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Aurora - Miljö och klimat',
                'url': f'{base}/projects/calls-for-applications-2/#environment',
                'description': 'Prioriterat område: Miljö. Stöd för gränsöverskridande projekt inom klimatanpassning, biologisk mångfald och hållbar naturresursanvändning.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Aurora - Hållbar mobilitet',
                'url': f'{base}/projects/calls-for-applications-2/#mobility',
                'description': 'Prioriterat område: Hållbar mobilitet. Stöd för gränsöverskridande projekt som förbättrar transport och mobilitet i Aurora-regionen.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg Aurora - Programinformation',
                'url': f'{base}/projects/calls-for-applications-2/',
                'description': 'Övergripande information om Interreg Aurora-programmet 2021-2027. Programmet stödjer gränsöverskridande samarbete mellan Norrland, Finland och Norge inklusive Sápmi-området.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
        ]
        return programs


if __name__ == "__main__":
    scraper = InterregAuroraScraper()
    scraper.scrape()
