import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class NatoSpsScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.nato.int/cps/en/natohq/78209.htm"
        self.alt_url = "https://www.nato.int/en/about-us/organization/nato-structure/science-for-peace-and-security-hub/"
        self.source_name = "NATO SPS"
        self.organization = "NATO Science for Peace and Security Programme"
        self.default_category = "defence_security"
        self.sector_tags = ["cybersäkerhet", "försvar", "dual-use", "säkerhet"]
        self.default_eligibility = (
            "Organisationer i NATO-länder (Sverige är NATO-land sedan 2024). "
            "Kräver minst EN NATO-nation + EN partner-nation i projektet."
        )

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        self._scrape_sps_page(self.base_url, grants_data, seen_urls)
        self.rate_limit()
        self._scrape_sps_page(self.alt_url, grants_data, seen_urls)

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] in seen_urls:
                continue
            seen_urls.add(prog['url'])
            grants_data.append(prog)
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _scrape_sps_page(self, url, grants_data, seen_urls):
        soup = self.fetch_page(url)
        if not soup:
            soup = self.fetch_page_playwright(url)
        if not soup:
            return

        selectors = ['article', '.callout', '.content-section', 'table tr', '.field-item']
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
            if not href or href == '#' or href.startswith('mailto:'):
                continue
            if not href.startswith('http'):
                href = 'https://www.nato.int' + href
            if href in seen_urls:
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
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
            if re.search(r'(open|active|accepting)', item_text, re.IGNORECASE):
                status_text = 'open'
            elif re.search(r'(closed|ended|completed)', item_text, re.IGNORECASE):
                status_text = 'closed'

            desc_elem = item.find('p')
            description = desc_elem.get_text(strip=True) if desc_elem else ''

            raw = {
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': status_text or 'open',
                'deadline_text': deadline_text,
                'category': self.default_category,
            }
            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

        sps_links = soup.select('a[href*="call"], a[href*="sps"], a[href*="grant"], a[href*="programme"]')
        for link in sps_links:
            href = link.get('href', '')
            if not href or href == '#' or href.startswith('mailto:'):
                continue
            if not href.startswith('http'):
                href = 'https://www.nato.int' + href
            if href in seen_urls:
                continue
            if 'nato.int' not in href:
                continue

            title = link.get_text(strip=True)
            if not title or len(title) < 8:
                continue
            if title.lower() in ['nato', 'home', 'about', 'contact']:
                continue
            seen_urls.add(href)

            raw = {
                'title': title,
                'url': href,
                'description': '',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            }
            grants_data.append(raw)
            print(f"  Found (link): {title[:60]}")

    def _get_known_programs(self):
        base = "https://www.nato.int/cps/en/natohq/78209.htm"
        return [
            {
                'title': 'NATO SPS - Multi-Year Projects (MYP)',
                'url': base + '#myp',
                'description': (
                    'Multi-Year Projects (MYP) support collaborative research between NATO and partner nations. '
                    'Projects run 2-3 years with budgets of €200,000 to €2,000,000. '
                    'Key priorities: Cyber Defence, Counter-Terrorism, Advanced Technologies, Energy Security.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '€200,000 - €2,000,000 over 2-3 years',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'NATO SPS - Advanced Research Workshops (ARW)',
                'url': base + '#arw',
                'description': (
                    'Advanced Research Workshops (ARW) bring together experts from NATO and partner countries '
                    'to discuss current security-related topics. Workshops typically last 2-5 days. '
                    'Key priorities: Cyber Defence, Counter-Terrorism, Advanced Technologies, Energy Security.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '~€60,000 per workshop',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'NATO SPS - Advanced Training Courses (ATC)',
                'url': base + '#atc',
                'description': (
                    'Advanced Training Courses (ATC) provide training in security-relevant scientific topics. '
                    'Courses bring together participants from NATO and partner nations. '
                    'Key priorities: Cyber Defence, Counter-Terrorism, Advanced Technologies, Energy Security.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '~€60,000 per course',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'NATO SPS - Cyber Defence Programme',
                'url': 'https://www.nato.int/cps/en/natohq/topics_78170.htm',
                'description': (
                    'SPS Cyber Defence projects support collaborative research and capacity building '
                    'in cybersecurity between NATO allies and partner nations. '
                    'One of four SPS Key Priorities with dedicated funding.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '€200,000 - €2,000,000',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'NATO SPS - Counter-Terrorism Programme',
                'url': 'https://www.nato.int/cps/en/natohq/topics_77718.htm',
                'description': (
                    'SPS Counter-Terrorism projects address threats from terrorism through scientific '
                    'collaboration. Includes CBRN defence, detection technologies, and border security.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '€200,000 - €2,000,000',
                'status_text': 'open',
                'deadline_text': '',
                'category': self.default_category,
            },
            {
                'title': 'NATO SPS - Energy Security Programme',
                'url': 'https://www.nato.int/cps/en/natohq/topics_49208.htm',
                'description': (
                    'SPS Energy Security projects support research in energy efficiency, '
                    'renewable energy for military and civil use, and protection of critical energy infrastructure.'
                ),
                'eligibility': self.default_eligibility,
                'amount_text': '€200,000 - €2,000,000',
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
        grant['source_type'] = 'NATO/Försvarsrelaterat'
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
    scraper = NatoSpsScraper()
    scraper.scrape()
