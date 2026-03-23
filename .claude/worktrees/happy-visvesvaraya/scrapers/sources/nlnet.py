import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper

EXCLUDE_URL_PATTERNS = [
    '#', 'mailto:', '/news/', '/about/', '/contact/', '/team/', '/blog/',
    '/press/', '/people/', '/foundation/', '/privacy/', '/cookies/',
    '/jobs/', '/events/', '/webinar/', '/podcast/', '/support/',
    'Acknowledgements', 'Diversity', '/bestpractices',
    '/faq', '/guide', '/eligibility', '/services/', '/funding.html',
    '/index.html', 'guideforapplicants',
    '/help/', '/legal/', '/donate/', '/annual-report',
    '/policies/', '/board/', '/history/', '/newsletter/',
    '/projects/', '/project/', '/stories/',
]

VALID_PROGRAMME_PATHS = [
    '/commonsfund', '/taler', '/fediversity', '/review', '/core',
    '/entrust', '/mobifree', '/assure', '/discovery',
    '/NGI0/', '/ngi0/',
]

KNOWN_PROGRAMMES = [
    {
        'title': 'NGI Zero Commons Fund',
        'url': 'https://nlnet.nl/commonsfund/',
        'description': (
            'The NGI Zero Commons Fund supports projects that contribute to an open internet. '
            'Grants range from €5,000 to €50,000 with calls every 2 months. '
            'Projects must be released as free/open source software. '
            'The fund supports search, discovery, privacy-by-design, and trustworthy AI.'
        ),
        'amount_text': '€5,000 - €50,000',
        'status_text': 'open',
    },
    {
        'title': 'NGI TALER',
        'url': 'https://nlnet.nl/taler/',
        'description': (
            'NGI TALER supports projects related to privacy-friendly digital payment systems. '
            'Part of the EU Next Generation Internet initiative. Focus on GNU Taler and '
            'related infrastructure for privacy-preserving electronic payments.'
        ),
        'amount_text': '€5,000 - €50,000',
        'status_text': 'open',
    },
    {
        'title': 'NGI Fediversity',
        'url': 'https://nlnet.nl/fediversity/',
        'description': (
            'NGI Fediversity funds projects that strengthen the fediverse and decentralized '
            'social networking. Focus on interoperability, federation protocols like ActivityPub, '
            'and user empowerment through decentralized communication.'
        ),
        'amount_text': '€5,000 - €50,000',
        'status_text': 'open',
    },
    {
        'title': 'NGI Zero Review',
        'url': 'https://nlnet.nl/review/',
        'description': (
            'NGI Zero Review supports independent code review, security audits, and accessibility '
            'improvements of critical open source software. Grants for third-party review of '
            'software that underpins internet infrastructure.'
        ),
        'amount_text': '€5,000 - €50,000',
        'status_text': 'open',
    },
    {
        'title': 'NGI Zero Core',
        'url': 'https://nlnet.nl/core/',
        'description': (
            'NGI Zero Core funds projects that contribute to core internet infrastructure. '
            'Focus on underlying protocols, standards, and implementations that the internet '
            'depends on. Part of the Next Generation Internet initiative.'
        ),
        'amount_text': '€5,000 - €50,000',
        'status_text': 'open',
    },
]


class NlnetScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://nlnet.nl/commonsfund/"
        self.ngi_url = "https://nlnet.nl/NGI0/"
        self.themes_url = "https://nlnet.nl/themes/"
        self.source_name = "NLnet Foundation / NGI Zero"
        self.organization = "NLnet Foundation"
        self.default_category = "open_source"
        self.sector_tags = ["open source", "privacy", "internet-infrastruktur", "FOSS"]
        self.default_eligibility = (
            "Organisationer och individer i Horizon Europe-länder inkl. Sverige. "
            "Projekt MÅSTE levereras som fri/öppen källkod (FOSS-licens obligatorisk)."
        )

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        self._scrape_commons_fund(grants_data, seen_urls)
        self.rate_limit()
        self._scrape_ngi_page(grants_data, seen_urls)
        self.rate_limit()
        self._scrape_themes_page(grants_data, seen_urls)

        for prog in KNOWN_PROGRAMMES:
            norm_url = prog['url'].rstrip('/')
            if any(u.rstrip('/') == norm_url for u in seen_urls):
                continue
            seen_urls.add(prog['url'])
            grants_data.append({
                'title': prog['title'],
                'url': prog['url'],
                'description': prog['description'],
                'eligibility': self.default_eligibility,
                'amount_text': prog.get('amount_text', '€5,000 - €50,000'),
                'status_text': prog.get('status_text', 'open'),
                'deadline_text': '',
                'category': self.default_category,
            })
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _is_valid_programme_url(self, href):
        if any(pat in href for pat in EXCLUDE_URL_PATTERNS):
            return False
        if 'nlnet.nl' not in href:
            return False
        if any(pat in href for pat in VALID_PROGRAMME_PATHS):
            return True
        return False

    def _is_valid_title(self, title):
        if not title or len(title) < 5:
            return False
        t = title.lower().strip()
        nav_titles = {
            'home', 'about', 'contact', 'news', 'events', 'press',
            'team', 'people', 'blog', 'faq', 'search', 'donate',
            'newsletter', 'cookies', 'privacy', 'legal', 'login',
            'more', 'read more', 'learn more', 'see all', 'view all',
            'next', 'previous', 'back', 'submit', 'close', 'menu',
            'nlnet foundation', 'nlnet', 'open source', 'funding',
            'help', 'support', 'acknowledgements',
            'coalition partners', 'regional representatives',
            'partners', 'sponsors', 'board', 'staff', 'vacancies',
        }
        if t in nav_titles:
            return False
        nav_contains = [
            'coalition', 'representative', 'partner list',
            'board member', 'annual report',
        ]
        if any(phrase in t for phrase in nav_contains):
            return False
        if len(title) > 200:
            return False
        return True

    def _has_meaningful_description(self, description):
        if not description or len(description) < 50:
            return False
        lower = description.lower()
        nav_phrases = [
            'skip to content', 'cookie', 'privacy policy',
            'all rights reserved', 'powered by', 'built with',
        ]
        if any(phrase in lower for phrase in nav_phrases):
            return False
        words = description.split()
        if len(words) < 8:
            return False
        return True

    def _scrape_commons_fund(self, grants_data, seen_urls):
        soup = self.fetch_page(self.base_url)
        if not soup:
            return

        main_content = soup.select_one('main, #content, .content, article')
        if not main_content:
            main_content = soup

        links = main_content.find_all('a', href=True)
        for link in links:
            href = link.get('href', '')
            if not href.startswith('http'):
                href = 'https://nlnet.nl' + href

            if href.rstrip('/') in {u.rstrip('/') for u in seen_urls}:
                continue
            if not self._is_valid_programme_url(href):
                continue

            title = link.get_text(strip=True)
            if not self._is_valid_title(title):
                continue

            parent = link.find_parent(['p', 'li', 'div', 'section'])
            description = ''
            if parent:
                desc = parent.get_text(' ', strip=True)
                if self._has_meaningful_description(desc):
                    description = desc[:500]

            sibling = link.find_next_sibling(['p', 'div'])
            if not description and sibling:
                desc = sibling.get_text(' ', strip=True)
                if self._has_meaningful_description(desc):
                    description = desc[:500]

            if not self._has_meaningful_description(description):
                continue

            seen_urls.add(href)
            deadline_text = ''
            date_match = re.search(
                r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
                description, re.IGNORECASE
            )
            if date_match:
                deadline_text = date_match.group(1)

            grants_data.append({
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': '€5,000 - €50,000',
                'status_text': 'open',
                'deadline_text': deadline_text,
                'category': self.default_category,
            })
            print(f"  Found: {title[:60]}")

    def _scrape_ngi_page(self, grants_data, seen_urls):
        soup = self.fetch_page(self.ngi_url)
        if not soup:
            return

        main_content = soup.select_one('main, #content, .content, article')
        if not main_content:
            main_content = soup

        fund_links = main_content.select('a[href*="fund"], a[href*="call"], a[href*="NGI"], a[href*="theme"]')
        for link in fund_links:
            href = link.get('href', '')
            if not href.startswith('http'):
                href = 'https://nlnet.nl' + href

            if href.rstrip('/') in {u.rstrip('/') for u in seen_urls}:
                continue
            if not self._is_valid_programme_url(href):
                continue

            title = link.get_text(strip=True)
            if not self._is_valid_title(title):
                continue

            parent = link.find_parent(['p', 'li', 'div', 'section'])
            description = ''
            if parent:
                desc = parent.get_text(' ', strip=True)
                if self._has_meaningful_description(desc):
                    description = desc[:500]

            if not self._has_meaningful_description(description):
                continue

            seen_urls.add(href)
            grants_data.append({
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': '€5,000 - €50,000',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            })
            print(f"  Found (NGI): {title[:60]}")

    def _scrape_themes_page(self, grants_data, seen_urls):
        soup = self.fetch_page(self.themes_url)
        if not soup:
            return

        main_content = soup.select_one('main, #content, .content, article')
        if not main_content:
            main_content = soup

        theme_links = main_content.find_all('a', href=True)
        for link in theme_links:
            href = link.get('href', '')
            if not href.startswith('http'):
                href = 'https://nlnet.nl' + href

            if href.rstrip('/') in {u.rstrip('/') for u in seen_urls}:
                continue
            if 'nlnet.nl' not in href:
                continue
            if any(pat in href for pat in EXCLUDE_URL_PATTERNS):
                continue
            if '/themes/' not in href and not any(pat in href for pat in VALID_PROGRAMME_PATHS):
                continue

            title = link.get_text(strip=True)
            if not self._is_valid_title(title):
                continue

            parent = link.find_parent(['p', 'li', 'div', 'section'])
            description = ''
            if parent:
                desc = parent.get_text(' ', strip=True)
                if self._has_meaningful_description(desc):
                    description = desc[:500]

            if not self._has_meaningful_description(description):
                continue

            seen_urls.add(href)
            grants_data.append({
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': '€5,000 - €50,000',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            })
            print(f"  Found (theme): {title[:60]}")

    def extract_amount(self, text):
        if not text:
            return None, None, text
        amount_min = None
        amount_max = None

        eur_millions = re.findall(r'[€EUR]*\s*(\d+(?:[.,]\d+)?)\s*(?:million|M€|MEUR)', text, re.IGNORECASE)
        for m in eur_millions:
            val = float(m.replace(',', '.')) * 1_000_000
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val

        eur_amounts = re.findall(r'€\s*(\d[\d,.\s]*\d)', text)
        if not eur_amounts:
            eur_amounts = re.findall(r'(\d[\d,.\s]*\d)\s*(?:EUR|€)', text, re.IGNORECASE)
        for t in eur_amounts:
            cleaned = t.replace(' ', '').replace(',', '')
            if '.' in cleaned:
                val = int(float(cleaned))
            else:
                val = int(cleaned)
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val

        sek_min, sek_max, _ = super().extract_amount(text)
        if sek_min and (amount_min is None or sek_min < amount_min):
            amount_min = sek_min
        if sek_max and (amount_max is None or sek_max > amount_max):
            amount_max = sek_max

        if amount_min == amount_max:
            amount_min = None
        return amount_min, amount_max, text

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'Stiftelse/NGI'
        amount_min, amount_max, _ = self.extract_amount(raw_data.get('amount_text', ''))
        grant['amount_min'] = amount_min
        grant['amount_max'] = amount_max
        base_keywords = grant.get('keywords', [])
        for tag in self.sector_tags:
            if tag not in base_keywords:
                base_keywords.append(tag)
        grant['keywords'] = base_keywords[:15]
        return grant


if __name__ == "__main__":
    scraper = NlnetScraper()
    scraper.scrape()
