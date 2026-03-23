import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class CostActionsScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.cost.eu/funding/open-call-a-simple-one-step-application-process/"
        self.actions_url = "https://www.cost.eu/cost-actions/"
        self.source_name = "COST Actions"
        self.organization = "COST Association"
        self.default_category = "research_network"
        self.sector_tags = ["forskning", "nätverk", "akademi", "tvärvetenskapligt"]
        self.default_eligibility = (
            "Forskare och organisationer i COST-medlemsländer inkl. Sverige. "
            "COST Actions är nätverksbidrag (ej projektbidrag) - möjlighet att "
            "delta i pan-europeiska FoU-nätverk med reseersättning."
        )

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        self._scrape_open_call(grants_data, seen_urls)
        self.rate_limit()
        self._scrape_active_actions(grants_data, seen_urls)

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] in seen_urls:
                continue
            seen_urls.add(prog['url'])
            grants_data.append(prog)
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _scrape_open_call(self, grants_data, seen_urls):
        soup = self.fetch_page(self.base_url)
        if not soup:
            soup = self.fetch_page_playwright(self.base_url)
        if not soup:
            return

        selectors = ['.views-row', 'article', '.cost-action-card', '.call-item', 'table tr']
        items = []
        for sel in selectors:
            items = soup.select(sel)
            if items:
                break

        for item in items:
            link = item.find('a', href=True)
            if not link:
                continue
            href = link.get('href', '')
            if not href or href == '#':
                continue
            if not href.startswith('http'):
                href = 'https://www.cost.eu' + href

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            if href in seen_urls:
                continue
            seen_urls.add(href)

            item_text = item.get_text(' ', strip=True)
            deadline_text = ''
            date_match = re.search(
                r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
                item_text, re.IGNORECASE
            )
            if date_match:
                deadline_text = date_match.group(1)

            status_text = ''
            if re.search(r'(open|ongoing)', item_text, re.IGNORECASE):
                status_text = 'open'
            elif re.search(r'(closed|ended)', item_text, re.IGNORECASE):
                status_text = 'closed'

            desc_elem = item.find('p')
            description = desc_elem.get_text(strip=True) if desc_elem else ''

            raw = {
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': '€125,000/year for 4 years per Action (networking grant)',
                'status_text': status_text,
                'deadline_text': deadline_text,
                'category': self.default_category,
            }
            grants_data.append(raw)
            print(f"  Found (open call): {title[:60]}")

        links = soup.select('a[href*="action"], a[href*="call"], a[href*="funding"]')
        for link in links:
            href = link.get('href', '')
            if not href or href == '#' or href.startswith('mailto:'):
                continue
            if not href.startswith('http'):
                href = 'https://www.cost.eu' + href
            if href in seen_urls:
                continue
            title = link.get_text(strip=True)
            if not title or len(title) < 8:
                continue
            if title.lower() in ['actions', 'funding', 'cost actions', 'open call']:
                continue
            seen_urls.add(href)
            raw = {
                'title': title,
                'url': href,
                'description': '',
                'eligibility': self.default_eligibility,
                'amount_text': '€125,000/year for 4 years per Action',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            }
            grants_data.append(raw)
            print(f"  Found (link): {title[:60]}")

    def _scrape_active_actions(self, grants_data, seen_urls):
        soup = self.fetch_page(self.actions_url)
        if not soup:
            soup = self.fetch_page_playwright(self.actions_url)
        if not soup:
            return

        selectors = ['.views-row', 'article', '.cost-action-card', 'table tr', 'a[href*="action"]']
        items = []
        for sel in selectors:
            found = soup.select(sel)
            if found and len(found) > 2:
                items = found[:30]
                break

        for item in items:
            link = item if item.name == 'a' else item.find('a', href=True)
            if not link:
                continue
            href = link.get('href', '')
            if not href or href == '#':
                continue
            if not href.startswith('http'):
                href = 'https://www.cost.eu' + href
            if href in seen_urls:
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            seen_urls.add(href)

            raw = {
                'title': f"COST Action: {title}" if not title.startswith('COST') else title,
                'url': href,
                'description': 'Active COST Action - open for new participants. Join pan-European research network with travel reimbursement.',
                'eligibility': self.default_eligibility,
                'amount_text': 'Networking grant with travel reimbursement (Short-Term Scientific Missions, Training Schools)',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            }
            grants_data.append(raw)
            print(f"  Found (active action): {title[:60]}")

    def _get_known_programs(self):
        return [
            {
                'title': 'COST Open Call - Propose a New COST Action',
                'url': 'https://www.cost.eu/funding/open-call-a-simple-one-step-application-process/',
                'description': (
                    'Annual open call for proposals for new COST Actions. '
                    'COST Actions are pan-European research networks lasting 4 years. '
                    'Budget approximately €125,000/year per Action for networking activities, '
                    'travel grants, Short-Term Scientific Missions (STSMs), and Training Schools.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '€125,000/year for 4 years (~€500,000 total per Action)',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
        ]

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

        eur_thousands = re.findall(r'€\s*(\d[\d\s,]*\d)', text)
        if not eur_thousands:
            eur_thousands = re.findall(r'(\d[\d\s,]*\d)\s*(?:EUR|€)', text, re.IGNORECASE)
        for t in eur_thousands:
            val = int(t.replace(' ', '').replace(',', ''))
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
        grant['source_type'] = 'EU/COST'
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
    scraper = CostActionsScraper()
    scraper.scrape()
