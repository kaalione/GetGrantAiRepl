import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class NordForskScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.nordforsk.org/calls"
        self.source_name = "NordForsk"
        self.organization = "NordForsk (Nordic Council of Ministers)"
        self.default_category = "research"
        self.headers['Accept-Language'] = 'en,nb;q=0.8'

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url, parser='lxml')
        if not soup:
            print("  Failed to fetch NordForsk calls page")
            return grants_data

        articles = soup.find_all('article')
        print(f"  Found {len(articles)} call articles on listing page")

        if not articles:
            h4_links = soup.select('h4 a[href*="/calls/"]')
            for link in h4_links:
                href = link.get('href', '')
                if not href.startswith('http'):
                    href = 'https://www.nordforsk.org' + href
                if href in seen_urls:
                    continue
                seen_urls.add(href)
                title = link.get_text(strip=True)
                if title and len(title) > 5:
                    grants_data.append({
                        'title': title,
                        'url': href,
                        'description': '',
                        'eligibility': 'Nordic research institutions and organizations',
                    })
            print(f"  Fallback: found {len(grants_data)} calls via h4 links")

        for art in articles:
            try:
                about = art.get('about', '')
                link = art.select_one('h4 a[href]')
                if not link:
                    link = art.select_one('a[href*="/calls/"]')
                if not link:
                    continue

                href = link.get('href', '') or about
                if not href:
                    continue
                if not href.startswith('http'):
                    href = 'https://www.nordforsk.org' + href
                if href in seen_urls:
                    continue
                seen_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue

                grants_data.append({
                    'title': title,
                    'url': href,
                    'description': '',
                    'eligibility': 'Nordic research institutions and organizations',
                })
                print(f"  Found: {title[:70]}")

            except Exception as e:
                print(f"  Error parsing article: {e}")

        print(f"  Parsed {len(grants_data)} calls from listing page, fetching details...")

        for i, grant in enumerate(grants_data):
            try:
                self.rate_limit(1)
                detail = self._fetch_detail_page(grant['url'])
                if detail:
                    if detail.get('description'):
                        grant['description'] = detail['description']
                    if detail.get('deadline_text'):
                        grant['deadline_text'] = detail['deadline_text']
                    if detail.get('amount_text'):
                        grant['amount_text'] = detail['amount_text']
                    if detail.get('eligibility'):
                        grant['eligibility'] = detail['eligibility']
                    if detail.get('status_text'):
                        grant['status_text'] = detail['status_text']
                print(f"  [{i+1}/{len(grants_data)}] Enriched: {grant['title'][:50]}")
            except Exception as e:
                print(f"  Error fetching detail: {e}")

        return grants_data

    def _fetch_detail_page(self, url):
        soup = self.fetch_page(url, parser='lxml')
        if not soup:
            return None

        result = {}

        meta = soup.find('meta', attrs={'name': 'description'})
        if meta and meta.get('content'):
            result['description'] = meta['content']

        main = soup.find('main') or soup

        paragraphs = main.find_all('p')
        for p in paragraphs:
            text = p.get_text(strip=True)

            if 'deadline' in text.lower() or 'frist' in text.lower():
                date_match = re.search(
                    r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
                    text, re.IGNORECASE
                )
                if date_match:
                    result['deadline_text'] = date_match.group(1)

            if 'budget' in text.lower() or 'funding' in text.lower():
                amount_match = re.search(
                    r'([\d,.]+\s*(?:million|mill\.?)\s*(?:NOK|EUR|DKK))',
                    text, re.IGNORECASE
                )
                if amount_match:
                    result['amount_text'] = amount_match.group(1)
                elif 'NOK' in text or 'EUR' in text:
                    result['amount_text'] = text.split(':', 1)[-1].strip() if ':' in text else text

        desc_parts = []
        for h2 in main.find_all('h2'):
            heading_text = h2.get_text(strip=True).lower()
            if any(kw in heading_text for kw in ['background', 'aim', 'about', 'objective', 'scope']):
                sibling = h2.find_next_sibling()
                while sibling and sibling.name not in ['h2', 'h3']:
                    text = sibling.get_text(strip=True)
                    if text and len(text) > 20:
                        desc_parts.append(text)
                    sibling = sibling.find_next_sibling()
                    if len(desc_parts) >= 4:
                        break

        if desc_parts:
            full_desc = ' '.join(desc_parts)
            if not result.get('description') or len(full_desc) > len(result['description']):
                result['description'] = full_desc

        for h2 in main.find_all('h2'):
            heading_text = h2.get_text(strip=True).lower()
            if any(kw in heading_text for kw in ['eligib', 'who can apply', 'requirements', 'applicant']):
                elig_parts = []
                sibling = h2.find_next_sibling()
                while sibling and sibling.name not in ['h2']:
                    text = sibling.get_text(strip=True)
                    if text:
                        elig_parts.append(text)
                    sibling = sibling.find_next_sibling()
                if elig_parts:
                    result['eligibility'] = ' '.join(elig_parts[:4])

        text_content = main.get_text(' ', strip=True).lower()
        if 'call is closed' in text_content or 'deadline has passed' in text_content:
            result['status_text'] = 'closed'
        elif 'call is open' in text_content or 'now accepting' in text_content:
            result['status_text'] = 'open'

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'no'
        grant['language'] = 'nb'
        grant['source_type'] = 'nordic'
        return grant


if __name__ == "__main__":
    scraper = NordForskScraper()
    scraper.scrape()
