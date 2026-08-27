import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class BoverketScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.boverket.se/sv/bidrag--garantier/"
        self.source_name = "Boverket"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Boverket"
        self.default_category = "housing"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if soup:
            links = soup.select('a[href*="/bidrag--garantier/"]')
            links += soup.select('a[href*="bidrag"]')
            links += soup.select('.listing a, article a, .card a, nav a[href*="bidrag"]')

            for link in links:
                href = link.get('href', '')
                if not href or href == '#':
                    continue
                if href.rstrip('/') == self.base_url.rstrip('/'):
                    continue

                if not href.startswith('http'):
                    href = 'https://www.boverket.se' + href

                if 'boverket.se' not in href:
                    continue
                if '/bidrag--garantier/' not in href:
                    continue

                skip_sub = ['se-vilka-som-fatt', 'planeringsguiden', 'nar-projektet-ar-fardigt',
                            'avvecklade-', 'bidrag-i-siffror', 'babhandboken', 'cookie', 'kontakt',
                            'mojliga-', 'vagledande', 'kreditgivare', 'information-for-',
                            'avgift-for-', 'finansiell-rad', 'som-far-bidrag-20',
                            'process-for-', 'ny--eller-ombyggnad', 'forverkligar',
                            'sa-gar-det-till', 'handboken', 'vanliga-fragor']
                if any(s in href.lower() for s in skip_sub):
                    continue
                path_parts = href.replace(self.base_url, '').strip('/').split('/')
                if len(path_parts) > 1:
                    continue

                if href in seen_urls:
                    continue
                seen_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                if title.lower() in ['bidrag och stöd', 'bidrag & garantier']:
                    continue

                category = self._categorize(title)
                raw = {
                    'title': title,
                    'url': href,
                    'description': '',
                    'eligibility': '',
                    'amount_text': '',
                    'status_text': '',
                    'deadline_text': '',
                    'category': category,
                }

                self.rate_limit()
                self._enrich_detail(raw)
                grants_data.append(raw)
                print(f"  Found: {title[:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['energi', 'klimat', 'renovering']):
            return 'energy'
        if any(w in t for w in ['kultur', 'samlings']):
            return 'culture'
        if any(w in t for w in ['kredit', 'garanti']):
            return 'financing'
        return self.default_category

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return
        desc_elem = detail.select_one('article, .main-content, main, .content, .sv-text-portlet')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            raw['description'] = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

        page_text = detail.get_text(' ', strip=True)
        page_lower = page_text.lower()

        date_match = re.search(
            r'(?:sista|stänger|ansök\s*senast)[:\s]*(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
            page_text, re.IGNORECASE
        )
        if date_match:
            raw['deadline_text'] = date_match.group(1)

        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
        if amount_match:
            raw['amount_text'] = amount_match.group(1)

        if any(w in page_lower for w in ['löpande', 'kan sökas löpande', 'ansökan är öppen', 'ansök nu', 'gör din ansökan']):
            raw['status_text'] = 'öppen'
        elif any(w in page_lower for w in ['inte möjligt att söka', 'stängd', 'avslutad', 'kan inte sökas', 'inga nya ansökningar']):
            raw['status_text'] = 'stängd'
        elif 'ansök' in page_lower and 'e-tjänst' in page_lower:
            raw['status_text'] = 'öppen'

        eligibility_parts = []
        for heading in detail.select('h2, h3, h4'):
            h_text = heading.get_text(strip=True).lower()
            if any(w in h_text for w in ['vem kan söka', 'vem kan få', 'vilka kan söka', 'vem riktar sig', 'målgrupp', 'villkor', 'krav']):
                sibling = heading.find_next_sibling()
                section_text = []
                while sibling and sibling.name not in ['h2', 'h3', 'h4']:
                    txt = sibling.get_text(strip=True)
                    if txt:
                        section_text.append(txt)
                    sibling = sibling.find_next_sibling()
                if section_text:
                    eligibility_parts.append(' '.join(section_text))

        if not eligibility_parts:
            elig_match = re.search(
                r'(?:vem\s+kan\s+(?:söka|få)|vilka\s+kan\s+söka|riktar\s+sig\s+till)[:\s]*([^.]+\.)',
                page_text, re.IGNORECASE
            )
            if elig_match:
                eligibility_parts.append(elig_match.group(1).strip())

        if eligibility_parts:
            raw['eligibility'] = ' '.join(eligibility_parts)


if __name__ == "__main__":
    scraper = BoverketScraper()
    scraper.scrape()
