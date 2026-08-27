import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class AlmiScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.almi.se/lan-finansiering/"
        self.source_name = "Almi"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Almi"
        self.default_category = "financing"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        listing_pages = [
            "https://www.almi.se/lan-finansiering/",
            "https://www.almi.se/riskkapital/",
            "https://www.almi.se/affarsutveckling/",
        ]

        for page_url in listing_pages:
            soup = self.fetch_page(page_url)
            if not soup:
                continue

            links = soup.select('a[href]')
            for link in links:
                href = link.get('href', '')
                if not href or href == '#':
                    continue
                if not href.startswith('http'):
                    href = 'https://www.almi.se' + href

                if 'almi.se' not in href:
                    continue

                is_relevant = (
                    '/lan-finansiering/' in href
                    or '/riskkapital/' in href
                    or '/affarsutveckling/' in href
                )
                if not is_relevant:
                    continue
                if href.rstrip('/') == page_url.rstrip('/'):
                    continue
                if href in seen_urls:
                    continue
                seen_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 3:
                    continue
                if title.lower() in ['lån & finansiering', 'riskkapital', 'affärsutveckling', 'kontakt', 'om almi']:
                    continue

                tag = self._get_tag(href)
                category = self._get_category(href)
                raw = {
                    'title': f"{title} - Almi",
                    'url': href,
                    'description': '',
                    'eligibility': 'små och medelstora företag, startup',
                    'amount_text': '',
                    'status_text': 'open',
                    'deadline_text': '',
                    'category': category,
                }
                if tag == 'lån':
                    raw['description'] = f"[Lån] "

                self.rate_limit()
                self._enrich_detail(raw)
                grants_data.append(raw)
                print(f"  Found: {raw['title'][:60]}")

            self.rate_limit()

        known = self._get_known_products()
        for prod in known:
            if prod['url'] in seen_urls:
                continue
            seen_urls.add(prod['url'])
            self.rate_limit()
            self._enrich_detail(prod)
            grants_data.append(prod)
            print(f"  Found (known): {prod['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _get_tag(self, url):
        if '/lan-finansiering/' in url:
            return 'lån'
        if '/riskkapital/' in url:
            return 'riskkapital'
        if '/affarsutveckling/' in url:
            return 'rådgivning'
        return 'financing'

    def _get_category(self, url):
        if '/lan-finansiering/' in url:
            return 'financing'
        if '/riskkapital/' in url:
            return 'venture_capital'
        if '/affarsutveckling/' in url:
            return 'business_development'
        return 'financing'

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return
        desc_elem = detail.select_one('article, .main-content, main, .content')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            desc_text = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])
            if raw['description'].startswith('['):
                raw['description'] = raw['description'] + desc_text
            else:
                raw['description'] = desc_text

        page_text = detail.get_text(' ', strip=True)
        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
        if amount_match:
            raw['amount_text'] = amount_match.group(1)

    def _get_known_products(self):
        products = [
            {"title": "Företagslån - Almi", "url": "https://www.almi.se/lan-finansiering/foretagslan/", "category": "financing", "tag": "lån"},
            {"title": "Grönt lån - Almi", "url": "https://www.almi.se/lan-finansiering/gront-lan/", "category": "financing", "tag": "lån"},
            {"title": "Tillväxtlån - Almi", "url": "https://www.almi.se/lan-finansiering/tillvaxtlan/", "category": "financing", "tag": "lån"},
            {"title": "Innovationslån - Almi", "url": "https://www.almi.se/lan-finansiering/innovationslan/", "category": "financing", "tag": "lån"},
            {"title": "Exportlån - Almi", "url": "https://www.almi.se/lan-finansiering/exportlan/", "category": "financing", "tag": "lån"},
            {"title": "Mikrolån - Almi", "url": "https://www.almi.se/lan-finansiering/mikrolan/", "category": "financing", "tag": "lån"},
            {"title": "Riskkapital - Almi Invest", "url": "https://www.almi.se/riskkapital/", "category": "venture_capital", "tag": "riskkapital"},
            {"title": "Affärsutveckling - Almi", "url": "https://www.almi.se/affarsutveckling/", "category": "business_development", "tag": "rådgivning"},
            {"title": "Hållbar utveckling - Almi rådgivning", "url": "https://www.almi.se/affarsutveckling/hallbar-utveckling/", "category": "business_development", "tag": "rådgivning"},
            {"title": "Digitalisering - Almi rådgivning", "url": "https://www.almi.se/affarsutveckling/digitalisering/", "category": "business_development", "tag": "rådgivning"},
            {"title": "Internationalisering - Almi rådgivning", "url": "https://www.almi.se/affarsutveckling/internationalisering/", "category": "business_development", "tag": "rådgivning"},
            {"title": "Styrelseutveckling - Almi rådgivning", "url": "https://www.almi.se/affarsutveckling/styrelseutveckling/", "category": "business_development", "tag": "rådgivning"},
            {"title": "Affärsrådgivning och mentorskap - Almi", "url": "https://www.almi.se/affarsutveckling/affarsradgivning/", "category": "business_development", "tag": "rådgivning"},
            {"title": "IFS Rådgivning - nyanlända företagare", "url": "https://www.almi.se/affarsutveckling/ifs-radgivning/", "category": "business_development", "tag": "rådgivning"},
        ]
        results = []
        for prod in products:
            desc_prefix = f"[{prod['tag'].capitalize()}] " if prod['tag'] == 'lån' else ''
            results.append({
                'title': prod['title'],
                'url': prod['url'],
                'description': desc_prefix,
                'eligibility': 'små och medelstora företag, startup',
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': prod['category'],
            })
        return results

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        if not grant['target_group'] or grant['target_group'] == ['all']:
            grant['target_group'] = ['sme', 'startup']
        return grant


if __name__ == "__main__":
    scraper = AlmiScraper()
    scraper.scrape()
