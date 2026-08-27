import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class NordicInnovationScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.nordicinnovation.org/programs"
        self.source_name = "Nordic Innovation"
        self.market = 'eu'  # EU-omfattande program — synligt i alla marknader
        self.organization = "Nordic Innovation"
        self.default_category = "nordic_innovation"
        self.default_eligibility = "Konsortium med partners från minst 3 nordiska länder. Svenska organisationer fullt berättigade."
        self.sector_tags = ["nordisk", "hållbarhet", "innovation", "SMF"]
        self.secondary_urls = [
            "https://www.nordforsk.org/funding-opportunities"
        ]
        self.headers['Accept-Language'] = 'en-US,en;q=0.9,sv-SE;q=0.8'

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if not soup:
            soup = self.fetch_page_playwright(self.base_url)
        if soup:
            self._extract_programs(soup, self.base_url, grants_data, seen_urls)

        for url in self.secondary_urls:
            self.rate_limit()
            soup = self.fetch_page(url)
            if not soup:
                soup = self.fetch_page_playwright(url)
            if soup:
                self._extract_programs(soup, url, grants_data, seen_urls)

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] not in seen_urls:
                seen_urls.add(prog['url'])
                grants_data.append(prog)
                print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _extract_programs(self, soup, page_url, grants_data, seen_urls):
        selectors = [
            '.view-content article',
            '.card',
            '.program-item',
            'a[href*="program"]',
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
            if any(kw in href.lower() for kw in ['program', 'funding', 'call', 'opportunity', 'project', 'grant']):
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

            allowed_domains = ['nordicinnovation.org', 'nordforsk.org']
            if not any(d in href for d in allowed_domains):
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            skip_titles = ['home', 'about', 'contact', 'menu', 'login', 'cookie', 'privacy', 'news', 'events']
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
                    r'(\d{1,2}[\s./\-]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s./\-]+\d{4}|\d{1,2}[./\-]\d{1,2}[./\-]\d{4})',
                    parent_text, re.IGNORECASE
                )
                if date_match:
                    deadline_text = date_match.group(1)

                status_match = re.search(r'(open|closed|upcoming|apply now|deadline|ongoing)', parent_text, re.IGNORECASE)
                if status_match:
                    status_text = status_match.group(1)

                amount_match = re.search(
                    r'((?:NOK|DKK|SEK|EUR|€)\s*[\d,.]+\s*(?:million|M|k|K)?[^.]*|[\d,.]+\s*(?:NOK|DKK|SEK|EUR|euro|million)[^.]*)',
                    parent_text, re.IGNORECASE
                )
                if amount_match:
                    amount_text = amount_match.group(1)[:200]

            raw = {
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': amount_text,
                'status_text': status_text,
                'deadline_text': deadline_text,
                'category': self._categorize(title),
            }

            self.rate_limit()
            self._enrich_detail(raw)
            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return

        desc_elem = detail.select_one('article, .main-content, main, .content, .field--name-body')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            desc = ' '.join(p.get_text(strip=True) for p in paragraphs[:6])
            if desc and (not raw.get('description') or len(desc) > len(raw['description'])):
                raw['description'] = desc

        page_text = detail.get_text(' ', strip=True)

        if not raw.get('deadline_text'):
            date_match = re.search(
                r'(?:deadline|closes?|due date|apply by|submission)[:\s]*(\d{1,2}[\s./\-]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s./\-]+\d{4}|\d{4}-\d{2}-\d{2})',
                page_text, re.IGNORECASE
            )
            if date_match:
                raw['deadline_text'] = date_match.group(1)

        if not raw.get('amount_text'):
            amount_match = re.search(
                r'(?:budget|funding|total|grant)[:\s]*((?:NOK|DKK|SEK|EUR|€)\s*[\d,.]+\s*(?:million|M)?[^.]*)',
                page_text, re.IGNORECASE
            )
            if amount_match:
                raw['amount_text'] = amount_match.group(1)[:200]

        if not raw.get('status_text'):
            status_match = re.search(r'(open|closed|upcoming|ongoing|apply now)', page_text, re.IGNORECASE)
            if status_match:
                raw['status_text'] = status_match.group(1)

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['green', 'climate', 'sustainable', 'hållbar', 'grön']):
            return 'green_transition'
        if any(w in t for w in ['digital', 'tech', 'ai', 'data']):
            return 'digital'
        if any(w in t for w in ['health', 'hälsa', 'welfare', 'life science']):
            return 'health'
        if any(w in t for w in ['energy', 'energi', 'hydrogen', 'battery']):
            return 'energy'
        if any(w in t for w in ['food', 'bio', 'agriculture', 'livsmedel']):
            return 'bioeconomy'
        if any(w in t for w in ['mobility', 'transport']):
            return 'mobility'
        return self.default_category

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'Nordiskt/Mellanstatligt'
        grant['keywords'] = list(set(grant.get('keywords', []) + self.sector_tags))[:15]

        if raw_data.get('amount_text') and 'NOK' in raw_data['amount_text'].upper():
            if grant['description'] and 'NOK' not in grant['description']:
                grant['description'] += ' (Belopp angivet i NOK.)'

        return grant

    def extract_amount(self, text):
        if not text:
            return None, None, text
        amount_min = None
        amount_max = None

        millions = re.findall(r'(\d+(?:[.,]\d+)?)\s*(?:million|M)\s*(?:NOK|DKK|SEK|EUR|euro|€)', text, re.IGNORECASE)
        if not millions:
            millions = re.findall(r'(?:NOK|DKK|SEK|EUR|€)\s*(\d+(?:[.,]\d+)?)\s*(?:million|M)', text, re.IGNORECASE)
        for m in millions:
            val = float(m.replace(',', '.')) * 1_000_000
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val

        direct = re.findall(r'(?:NOK|DKK|SEK|EUR|€)\s*(\d[\d,. ]*\d)', text, re.IGNORECASE)
        if not direct:
            direct = re.findall(r'(\d[\d,. ]*\d)\s*(?:NOK|DKK|SEK|EUR|euro)', text, re.IGNORECASE)
        for t in direct:
            val_str = t.replace(' ', '').replace(',', '').replace('.', '')
            try:
                val = int(val_str)
                if val < 1000:
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
                'title': 'Nordic Innovation Programs',
                'url': 'https://www.nordicinnovation.org/programs',
                'description': 'Nordic Innovation funds programs and projects that drive innovation and sustainable growth across the Nordic region. Focus areas include green transition, digitalisation, and Nordic competitiveness.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'Nordic Innovation - Green and Sustainable Growth',
                'url': 'https://www.nordicinnovation.org/programs#green',
                'description': 'Nordic Innovation programs focused on green transition and sustainable growth. Supports Nordic collaboration on climate, circular economy, and sustainable business models.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'green_transition',
            },
            {
                'title': 'NordForsk Funding Opportunities',
                'url': 'https://www.nordforsk.org/funding-opportunities',
                'description': 'NordForsk provides funding for Nordic research cooperation and research infrastructure. Supports collaborative projects between researchers and institutions across Nordic countries.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
        ]


if __name__ == "__main__":
    scraper = NordicInnovationScraper()
    scraper.scrape()
