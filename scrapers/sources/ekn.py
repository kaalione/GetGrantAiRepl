import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class EknScraper(BaseScraper):
    """EKN (Exportkreditnämnden) — svenska statens exportkreditgarantier.

    Garantierna är löpande produkter utan utlysningsdeadline; de listas på
    en statisk produktsida per garanti under /garantier/vara-garantier/.
    """

    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.ekn.se/garantier/vara-garantier/ekns-garantier/"
        self.source_name = "EKN (Exportkreditnämnden)"
        self.organization = "Exportkreditnämnden"
        self.default_category = "export"
        self.market = 'se'

    def fetch_grants(self):
        grants_data = []
        soup = self.fetch_page(self.base_url)
        if not soup:
            raise Exception("Failed to fetch EKN listing page")

        prefix = '/garantier/vara-garantier/ekns-garantier/'
        seen_urls = set()
        for link in soup.find_all('a', href=True):
            href = link['href'].split('#')[0].split('?')[0]
            if not href.startswith('http'):
                href = 'https://www.ekn.se' + href
            path = href.replace('https://www.ekn.se', '')
            subpath = path[len(prefix):].strip('/') if path.startswith(prefix) else ''
            # Endast direkta produktsidor (en nivå under index)
            if not subpath or '/' in subpath or href in seen_urls:
                continue
            seen_urls.add(href)

            title = link.get_text(strip=True).replace('­', '')
            if not title or len(title) < 5:
                continue

            description, amount_text, eligibility = self._fetch_product(href)

            grants_data.append({
                'title': title,
                'url': href,
                'description': description,
                'eligibility': eligibility,
                'amount_text': amount_text,
                'status_text': 'öppen',  # löpande produkt, ingen deadline
                'deadline_text': '',
                'category': self.default_category,
            })
            print(f"  Found: {title[:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _fetch_product(self, url):
        soup = self.fetch_page(url)
        if not soup:
            return '', '', ''
        main = soup.find('main') or soup
        paragraphs = [
            p.get_text(' ', strip=True).replace('­', '')
            for p in main.find_all('p')
        ]
        paragraphs = [p for p in paragraphs if len(p) > 60][:5]
        description = ' '.join(paragraphs)

        text = main.get_text(' ', strip=True).replace('­', '')
        amount_match = re.search(
            r'(\d[\d\s,.]*\s*(?:miljoner|miljarder|mnkr|mdkr)?\s*(?:kronor|kr|SEK))',
            text
        )
        amount_text = amount_match.group(1) if amount_match else ''

        elig_match = re.search(
            r'((?:Den här garantin är för|Garantin är för|För dig som|För företag)[^.]*\.)',
            text
        )
        eligibility = elig_match.group(1) if elig_match else ''
        return description, amount_text, eligibility

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'myndighet'
        # Garantierna är löpande — ingen deadline betyder öppen, inte stängd.
        grant['status'] = 'open'
        # EKN:s garantier riktar sig till exporterande företag och deras
        # underleverantörer — sektorer i target_group så branschmatchningen
        # ser det (inte bara storlekskategorier).
        for sector in ('export', 'trade', 'manufacturing'):
            if sector not in grant['target_group']:
                grant['target_group'].append(sector)
        return grant


if __name__ == "__main__":
    scraper = EknScraper()
    scraper.scrape()
