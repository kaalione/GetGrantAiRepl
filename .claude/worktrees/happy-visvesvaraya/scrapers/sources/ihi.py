import sys
import os
import re
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper

import requests as _requests


class IhiScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.ihi.europa.eu/apply-funding/open-calls"
        self.source_name = "IHI (Innovative Health Initiative)"
        self.organization = "IHI"
        self.default_category = "health_innovation"
        self.default_eligibility = "Organisationer i EU-länder inkl. Sverige. Public-private partnership under Horizon Europe. Projekt typiskt €5-30M."
        self.sector_tags = ["hälsa", "life science", "pharma", "healthtech", "klinisk forskning"]
        self.secondary_urls = [
            "https://www.ihi.europa.eu/apply-funding/future-opportunities",
        ]
        self.headers['Accept-Language'] = 'en-US,en;q=0.9,sv-SE;q=0.8'

    def fetch_page_ssl_bypass(self, url, timeout=30):
        try:
            response = _requests.get(url, headers=self.headers, timeout=timeout, verify=False)
            response.raise_for_status()
            print(f"  IHI: SSL verification disabled — known issue with ihi.europa.eu cert")
            from bs4 import BeautifulSoup
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            print(f"  Error fetching {url} (SSL bypass): {e}")
            return None

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page_ssl_bypass(self.base_url)
        if not soup:
            soup = self.fetch_page_playwright(self.base_url, timeout=60000)
        if soup:
            self._extract_calls(soup, self.base_url, grants_data, seen_urls)

        for url in self.secondary_urls:
            self.rate_limit()
            soup = self.fetch_page_ssl_bypass(url)
            if not soup:
                soup = self.fetch_page_playwright(url, timeout=60000)
            if soup:
                self._extract_calls(soup, url, grants_data, seen_urls)

        if not grants_data:
            print("  WARNING: No grants found from live IHI pages — returning empty (no hardcoded fallback)")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _extract_calls(self, soup, page_url, grants_data, seen_urls):
        nav_footer = soup.select('nav a, footer a, header a, .menu a, .breadcrumb a, .nav a')
        nav_footer_hrefs = set(a.get('href', '') for a in nav_footer)

        skip_titles = {
            'home', 'about', 'contact', 'menu', 'login', 'cookie', 'privacy',
            'legal', 'search', 'back', 'close', 'skip', 'accessibility',
            'apply for funding', 'open calls', 'future opportunities',
            'calls for proposals', 'how to apply', 'evaluation process',
            'faq', 'frequently asked questions', 'external experts',
            'partners', 'governance', 'strategic research agenda',
            'closed calls', 'find partners', 'call documents',
            'how call topics are generated', 'projects and results',
            'project factsheets', 'maps and statistics', 'health spotlights',
            'resources for projects', 'engaging with regulators',
            'exploitation of project results', 'open science',
            'project communications', 'project dissemination',
            'project documents', 'ihi funding model', 'future opportunities page',
            'news', 'events', 'publications', 'reports', 'media',
            'who we are', 'what we do', 'our impact', 'join us',
            'stakeholder forum', 'scientific committee', 'governing board',
            'states representatives group', 'science industry panel',
        }

        skip_title_contains = [
            'spotlights', 'factsheet', 'resources for', 'engaging with',
            'exploitation', 'communications', 'dissemination', 'documents',
            'statistics', 'maps and', 'how call', 'find partner',
            'funding model', 'future opportunities page',
        ]

        containers = []
        container_selectors = [
            '.view-content .views-row',
            '.node--type-call',
            '.call-item',
            '.paragraph--type--call',
            'table tbody tr',
            '.field--name-field-call',
            '.views-row',
            '.node--view-mode-teaser',
            '.layout__region article',
        ]
        for sel in container_selectors:
            found = soup.select(sel)
            if found:
                containers.extend(found)

        if containers:
            for container in containers:
                self._extract_from_container(container, page_url, grants_data, seen_urls, nav_footer_hrefs, skip_titles)

        all_links = soup.find_all('a', href=True)
        for a in all_links:
            href = a.get('href', '')
            title = a.get_text(strip=True)
            if not title or len(title) < 10:
                continue
            t_lower = title.lower().strip()
            if t_lower in skip_titles:
                continue
            if any(phrase in t_lower for phrase in skip_title_contains):
                continue

            h_lower = href.lower()

            is_call_link = any(kw in h_lower for kw in [
                'call', 'topic', 'ihi-', 'apply', 'funding',
                'proposal', 'programme', 'project',
            ])
            is_call_title = any(kw in t_lower for kw in [
                'call', 'ihi-', 'topic', 'programme', 'project',
                'antimicrobial', 'digital', 'cancer', 'clinical',
                'cardiovascular', 'health', 'innovative', 'data',
                'patient', 'therapy', 'diagnostics', 'pandemic',
            ])

            if not is_call_link and not is_call_title:
                continue

            if not href.startswith('http'):
                from urllib.parse import urljoin
                href = urljoin(page_url, href)

            if href in seen_urls or href in nav_footer_hrefs:
                continue

            if 'ihi.europa.eu' not in href and 'europa.eu' not in href:
                continue

            bad_url_parts = ['/news/', '/event/', '/press/', '/about/', '/team/',
                            '/cookie', '/privacy', '/legal', '/login', '/search']
            if any(part in href.lower() for part in bad_url_parts):
                continue

            seen_urls.add(href)

            parent = a.find_parent(['div', 'li', 'article', 'tr', 'section', 'td'])
            description, deadline_text, status_text, amount_text = self._extract_metadata(parent)

            call_match = re.search(r'(IHI[-\s]*\d+[-\s]*\d+|Call\s*\d+|Topic\s*\d+)', title, re.IGNORECASE)
            if call_match and description:
                description = f"[{call_match.group(1).strip()}] {description}"
            elif call_match:
                description = f"[{call_match.group(1).strip()}]"

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
            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

    def _extract_from_container(self, container, page_url, grants_data, seen_urls, nav_hrefs, skip_titles):
        links = container.find_all('a', href=True)
        for a in links:
            href = a.get('href', '')
            title = a.get_text(strip=True)

            if not title or len(title) < 8:
                continue
            if title.lower().strip() in skip_titles:
                continue
            if not href.startswith('http'):
                from urllib.parse import urljoin
                href = urljoin(page_url, href)
            if href in seen_urls or href in nav_hrefs:
                continue
            if 'ihi.europa.eu' not in href and 'europa.eu' not in href:
                continue

            seen_urls.add(href)
            description, deadline_text, status_text, amount_text = self._extract_metadata(container)

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
            grants_data.append(raw)
            print(f"  Found (container): {title[:60]}")

    def _extract_metadata(self, parent):
        description = ''
        deadline_text = ''
        status_text = ''
        amount_text = ''

        if not parent:
            return description, deadline_text, status_text, amount_text

        parent_text = parent.get_text(' ', strip=True)

        desc_elem = parent.find('p')
        if desc_elem:
            description = desc_elem.get_text(strip=True)
        if not description and len(parent_text) > 30:
            description = parent_text[:500]

        date_match = re.search(
            r'(\d{1,2}[\s./\-]+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s./\-]+\d{4}|\d{1,2}[./\-]\d{1,2}[./\-]\d{4}|\d{4}-\d{2}-\d{2})',
            parent_text, re.IGNORECASE
        )
        if date_match:
            deadline_text = date_match.group(1)

        status_match = re.search(r'(open|closed|upcoming|forthcoming|under evaluation|deadline passed)', parent_text, re.IGNORECASE)
        if status_match:
            status_text = status_match.group(1)

        amount_match = re.search(r'(€[\d,.]+\s*(?:million|M|k|K)?[^.]*|[\d,.]+\s*(?:EUR|euro|million)[^.]*)', parent_text, re.IGNORECASE)
        if amount_match:
            amount_text = amount_match.group(1)[:200]

        return description, deadline_text, status_text, amount_text

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['antimicrobial', 'amr', 'infectious', 'pathogen']):
            return 'antimicrobial'
        if any(w in t for w in ['digital', 'data', 'ai', 'artificial']):
            return 'digital_health'
        if any(w in t for w in ['oncology', 'cancer', 'tumour']):
            return 'oncology'
        if any(w in t for w in ['clinical', 'trial', 'patient']):
            return 'clinical'
        if any(w in t for w in ['cardiovascular', 'heart']):
            return 'cardiovascular'
        return self.default_category

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'EU/IHI'
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

        eur_direct = re.findall(r'€\s*(\d[\d,. ]*\d)', text)
        if not eur_direct:
            eur_direct = re.findall(r'(\d[\d,. ]*\d)\s*(?:EUR|euro)', text, re.IGNORECASE)
        for t in eur_direct:
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


if __name__ == "__main__":
    scraper = IhiScraper()
    scraper.scrape()
