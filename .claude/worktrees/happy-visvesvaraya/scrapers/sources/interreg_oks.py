import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class InterregOKSScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://interreg-oks.eu/"
        self.source_name = "Interreg ÖKS"
        self.organization = "Interreg ÖKS"
        self.default_category = "eu"
        self.calls_url = "https://interreg-oks.eu/forersomvillansoka.488.html"
        self.default_eligibility = "offentliga organisationer, privata organisationer, minst 2 partners från 2 av 3 länder (Sverige, Danmark, Norge)"

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

            if any(kw in href.lower() for kw in ['utlysning', 'ansok', 'call', 'projekt']):
                if not href.startswith('http'):
                    href = self.base_url.rstrip('/') + '/' + href.lstrip('/')

                if href in seen_urls:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue

                seen_urls.add(href)

                parent = link.find_parent(['li', 'div', 'article', 'section', 'tr'])
                status_text = ''
                deadline_text = ''
                if parent:
                    parent_text = parent.get_text(' ', strip=True)
                    status_match = re.search(r'(öppen|stängd|avslutad|pågående|kommande|open|closed)', parent_text, re.IGNORECASE)
                    if status_match:
                        status_text = status_match.group(1)
                    date_match = re.search(r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})', parent_text, re.IGNORECASE)
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
        links = soup.select('a[href*="utlysning"], a[href*="ansok"], a[href*="call"]')
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
                'title': 'Interreg ÖKS - Innovation & Entreprenörskap',
                'url': f'{base}/forersomvillansoka.488.html#innovation',
                'description': 'Stöd för gränsöverskridande samarbetsprojekt inom innovation och entreprenörskap i Öresund-Kattegat-Skagerrak-regionen. Programmet stödjer projekt som stärker innovationskapaciteten och entreprenörskapet i regionen. Totalbudget ca €140 miljoner för programperioden 2021-2027.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering, totalbudget €140 miljoner',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg ÖKS - Grön Omställning',
                'url': f'{base}/forersomvillansoka.488.html#green',
                'description': 'Stöd för gränsöverskridande samarbetsprojekt inom grön omställning. Projekten ska bidra till klimatomställning, hållbar energi och cirkulär ekonomi i Öresund-Kattegat-Skagerrak-regionen.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg ÖKS - Transport & Mobilitet',
                'url': f'{base}/forersomvillansoka.488.html#transport',
                'description': 'Stöd för gränsöverskridande samarbetsprojekt inom hållbar transport och mobilitet. Projekten ska förbättra gränsöverskridande transportlösningar och mobilitet i ÖKS-regionen.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg ÖKS - Gränslös Arbetsmarknad',
                'url': f'{base}/forersomvillansoka.488.html#labour',
                'description': 'Stöd för gränsöverskridande samarbetsprojekt som syftar till att skapa en mer integrerad och gränslös arbetsmarknad i Öresund-Kattegat-Skagerrak-regionen.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Upp till 65% EU-medfinansiering',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
            {
                'title': 'Interreg ÖKS Programhandbok - Information för sökande',
                'url': f'{base}/forersomvillansoka.488.html',
                'description': 'Övergripande information om Interreg Öresund-Kattegat-Skagerrak-programmet. Programmet omfattar Skåne, Halland, Västra Götaland samt delar av Danmark och Norge. Utlysningar sker vanligtvis vår och höst.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Totalbudget €140 miljoner för programperioden 2021-2027',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'eu',
            },
        ]
        return programs


if __name__ == "__main__":
    scraper = InterregOKSScraper()
    scraper.scrape()
