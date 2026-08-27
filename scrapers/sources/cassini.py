import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class CassiniScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.cassini.eu/accelerator/"
        self.source_name = "CASSINI / EUSPA"
        self.market = 'eu'  # EU-omfattande program — synligt i alla marknader
        self.organization = "CASSINI / EUSPA"
        self.default_category = "space_tech"
        self.default_eligibility = "EU-baserade startups och SMF inom rymdteknik. Sverige fullt berättigat."
        self.sector_tags = ["space tech", "satellit", "rymdfart", "geospatialt"]
        self.secondary_urls = [
            "https://www.euspa.europa.eu/opportunities/for-startups"
        ]
        self.headers['Accept-Language'] = 'en-US,en;q=0.9,sv-SE;q=0.8'

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if not soup:
            soup = self.fetch_page_playwright(self.base_url)
        if soup:
            self._extract_from_page(soup, self.base_url, grants_data, seen_urls)

        for url in self.secondary_urls:
            self.rate_limit()
            soup = self.fetch_page(url)
            if not soup:
                soup = self.fetch_page_playwright(url)
            if soup:
                self._extract_from_page(soup, url, grants_data, seen_urls)

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] not in seen_urls:
                seen_urls.add(prog['url'])
                grants_data.append(prog)
                print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _extract_from_page(self, soup, page_url, grants_data, seen_urls):
        selectors = [
            'article',
            '.card',
            '.post-item',
            'a[href*="call"]',
            'a[href*="apply"]',
            'a[href*="accelerator"]',
        ]

        links = []
        for sel in selectors:
            elements = soup.select(sel)
            for el in elements:
                if el.name == 'a':
                    links.append(el)
                else:
                    for a in el.find_all('a', href=True):
                        links.append(a)

        for a in soup.select('a[href]'):
            href = a.get('href', '')
            if any(kw in href.lower() for kw in ['call', 'apply', 'accelerator', 'hackathon', 'programme', 'program']):
                if a not in links:
                    links.append(a)

        nav_footer = soup.select('nav a, footer a, header a')
        nav_footer_hrefs = set(a.get('href', '') for a in nav_footer)

        for link in links:
            href = link.get('href', '')
            if not href or href == '#' or href.startswith('mailto:') or href.startswith('javascript:'):
                continue
            if href in nav_footer_hrefs:
                continue

            if not href.startswith('http'):
                from urllib.parse import urljoin
                href = urljoin(page_url, href)

            if href in seen_urls:
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            skip_titles = ['home', 'about', 'contact', 'menu', 'login', 'sign up', 'cookie', 'privacy']
            if title.lower().strip() in skip_titles:
                continue

            seen_urls.add(href)

            parent = link.find_parent(['article', 'div', 'li', 'section'])
            description = ''
            deadline_text = ''
            status_text = ''
            amount_text = ''

            if parent:
                parent_text = parent.get_text(' ', strip=True)
                desc_elem = parent.find('p')
                if desc_elem:
                    description = desc_elem.get_text(strip=True)

                date_match = re.search(
                    r'(\d{1,2}[./\-]\d{1,2}[./\-]\d{4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
                    parent_text, re.IGNORECASE
                )
                if date_match:
                    deadline_text = date_match.group(1)

                status_match = re.search(r'(open|closed|upcoming|apply now|deadline)', parent_text, re.IGNORECASE)
                if status_match:
                    status_text = status_match.group(1)

                amount_match = re.search(r'(€[\d,.]+\s*(?:k|K|thousand|million|M)?|[\d,.]+\s*(?:EUR|euro))', parent_text, re.IGNORECASE)
                if amount_match:
                    amount_text = amount_match.group(1)

            raw = {
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': amount_text,
                'status_text': status_text,
                'deadline_text': deadline_text,
                'category': self.default_category,
            }

            self.rate_limit()
            self._enrich_detail(raw)
            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return

        desc_elem = detail.select_one('article, .main-content, main, .content, .entry-content')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            desc = ' '.join(p.get_text(strip=True) for p in paragraphs[:6])
            if desc and (not raw.get('description') or len(desc) > len(raw['description'])):
                raw['description'] = desc

        page_text = detail.get_text(' ', strip=True)

        if not raw.get('deadline_text'):
            date_match = re.search(
                r'(?:deadline|closes?|due date|apply by)[:\s]*(\d{1,2}[\s./\-]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s./\-]+\d{4}|\d{1,2}[./\-]\d{1,2}[./\-]\d{4})',
                page_text, re.IGNORECASE
            )
            if date_match:
                raw['deadline_text'] = date_match.group(1)

        if not raw.get('amount_text'):
            amount_match = re.search(r'(€[\d,.]+\s*(?:k|K|thousand|million|M)?[^.]*|[\d,.]+\s*(?:EUR|euro)[^.]*)', page_text, re.IGNORECASE)
            if amount_match:
                raw['amount_text'] = amount_match.group(1)[:200]

        if not raw.get('status_text'):
            status_match = re.search(r'(open|closed|upcoming|apply now)', page_text, re.IGNORECASE)
            if status_match:
                raw['status_text'] = status_match.group(1)

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'EU/Rymd'
        grant['keywords'] = list(set(grant.get('keywords', []) + self.sector_tags))[:15]
        return grant

    def extract_amount(self, text):
        if not text:
            return None, None, text
        amount_min = None
        amount_max = None

        eur_millions = re.findall(r'(\d+(?:[.,]\d+)?)\s*(?:million|M)\s*(?:EUR|euro|€)', text, re.IGNORECASE)
        if not eur_millions:
            eur_millions = re.findall(r'€\s*(\d+(?:[.,]\d+)?)\s*(?:million|M)', text, re.IGNORECASE)
        for m in eur_millions:
            val = float(m.replace(',', '.')) * 1_000_000
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val

        eur_thousands = re.findall(r'€\s*(\d[\d,. ]*\d)(?:\s*(?:k|K|thousand))?', text)
        if not eur_thousands:
            eur_thousands = re.findall(r'(\d[\d,. ]*\d)\s*(?:EUR|euro)', text, re.IGNORECASE)
        for t in eur_thousands:
            val_str = t.replace(' ', '').replace(',', '').replace('.', '')
            try:
                val = int(val_str)
                if val < 100:
                    continue
                if amount_max is None or val > amount_max:
                    amount_max = val
                if amount_min is None or val < amount_min:
                    amount_min = val
            except ValueError:
                pass

        if amount_min == amount_max:
            amount_min = None

        return amount_min, amount_max, text

    def _get_known_programs(self):
        return [
            {
                'title': 'CASSINI Accelerator - Space Entrepreneurship Programme',
                'url': 'https://www.cassini.eu/accelerator/',
                'description': 'CASSINI Accelerator supports space-based startups and SMEs across Europe with mentorship, funding, and market access. Equity-free support with vouchers up to €75,000.',
                'eligibility': self.default_eligibility,
                'amount_text': '€75,000 voucher',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'CASSINI Hackathons & Mentoring',
                'url': 'https://www.cassini.eu/hackathons-and-mentoring/',
                'description': 'CASSINI Hackathons bring together entrepreneurs to develop innovative solutions using EU space data and services (Galileo, Copernicus, EGNOS). Prizes and mentoring for winners.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'EUSPA Opportunities for Space Startups',
                'url': 'https://www.euspa.europa.eu/opportunities/for-startups',
                'description': 'EU Agency for the Space Programme (EUSPA) funding and support opportunities for startups leveraging EU space infrastructure including Galileo, EGNOS, and Copernicus.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
        ]


if __name__ == "__main__":
    scraper = CassiniScraper()
    scraper.scrape()
