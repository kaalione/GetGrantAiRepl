import sys
import os
import re
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


CLOSED_PROGRAMS = ['innovation voucher', 'tempo', 'young innovative company', 'niy']

KNOWN_PROGRAMS = [
    {
        'title': 'Sprint Funding',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/sprint-funding',
        'description': (
            'Sprint Funding is a new 2026 funding instrument replacing the discontinued Tempo programme. '
            'It provides up to €100,000 for small companies with innovative products or services '
            'and international growth potential. Sprint Funding supports the commercialisation '
            'and international market entry of innovations. The funding covers up to 50% of eligible costs.'
        ),
        'amount_text': 'Max €100,000, 50% support rate',
        'eligibility': (
            'Small companies registered in Finland with an innovative product or service. '
            'Must have international growth potential. '
            'Company must have at least 2 employees.'
        ),
        'category': 'innovation',
        'note': 'NEW 2026 — replaces Tempo',
    },
    {
        'title': 'R&D Funding — Research and Development',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/research-and-development-funding',
        'description': (
            'R&D Funding supports companies research and development projects aimed at creating '
            'new products, services, or processes. Funding covers research (50% for SMEs) and '
            'development (35% for SMEs) activities. Continuous application — no deadlines. '
            'Available for companies of all sizes registered in Finland.'
        ),
        'amount_text': '50% for research, 35% for development (SME rates)',
        'eligibility': (
            'All companies registered in Finland. '
            'Project must involve genuine research or experimental development. '
            'Company must have sufficient resources to carry out the project.'
        ),
        'category': 'research',
    },
    {
        'title': 'Co-Innovation Funding',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/co-innovation',
        'description': (
            'Co-Innovation Funding is designed for consortia of companies and research organisations '
            'working together on ambitious innovation projects. Projects should create significant '
            'new business opportunities and involve collaboration between multiple partners.'
        ),
        'amount_text': 'Variable, based on consortium project size',
        'eligibility': (
            'Consortia of companies and research organisations. '
            'Minimum 3 partners (at least 2 companies). '
            'Project must have significant innovation potential and international relevance.'
        ),
        'category': 'innovation',
    },
    {
        'title': 'Energy Aid',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/energy-aid',
        'description': (
            'Energy Aid supports investments in renewable energy production, energy efficiency improvements, '
            'and new energy technology. Available for companies and organisations of all sizes. '
            'Supports Finlands transition to carbon-neutral energy systems.'
        ),
        'amount_text': 'Variable, depends on project type and technology',
        'eligibility': (
            'Companies and organisations investing in energy efficiency or renewable energy. '
            'Project must contribute to energy savings or renewable energy production.'
        ),
        'category': 'energy',
    },
    {
        'title': 'Deep Tech Accelerator',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/deep-tech-accelerator',
        'description': (
            'Deep Tech Accelerator supports research-based startups in commercialising deep technology. '
            'Provides up to €400,000 per phase (3 phases). Targets companies less than 5 years old '
            'with technology based on scientific research. Includes mentoring and networking.'
        ),
        'amount_text': 'Up to €400,000 per phase (3 phases), max €1,200,000 total',
        'eligibility': (
            'Research-based startups less than 5 years old. '
            'Technology must be based on scientific research. '
            'Company must be registered in Finland.'
        ),
        'category': 'innovation',
    },
    {
        'title': 'ESA BIC Incubation',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/esa-bic-finland',
        'description': (
            'ESA Business Incubation Centre (BIC) Finland supports startups that leverage space technology '
            'or data for non-space applications. Provides up to €90,000 in funding along with '
            'business development support, mentoring, and access to ESA facilities.'
        ),
        'amount_text': 'Max €90,000',
        'eligibility': (
            'Startups using space technology or satellite data for terrestrial applications. '
            'Company must be less than 5 years old and registered in Finland.'
        ),
        'category': 'innovation',
    },
    {
        'title': 'EU Proposal Preparation Funding',
        'url': 'https://www.businessfinland.fi/en/for-finnish-customers/services/funding/eu-proposal-preparation',
        'description': (
            'Funding for Finnish companies preparing proposals for EU Horizon Europe programme. '
            'Covers up to 75% of preparation costs, with a maximum of €60,000. '
            'Supports the costs of writing and coordinating Horizon Europe applications.'
        ),
        'amount_text': 'Up to €60,000, 75% support rate',
        'eligibility': (
            'Finnish companies preparing a Horizon Europe proposal. '
            'Company must be a participant or coordinator in the proposal.'
        ),
        'category': 'innovation',
    },
]


class BusinessFinlandScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.businessfinland.fi/en/services/funding/"
        self.calls_url = "https://www.businessfinland.fi/en/services/funding/calls/"
        self.source_name = "Business Finland"
        self.market = 'fi'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Business Finland"
        self.default_category = "innovation"
        self.headers['Accept-Language'] = 'en-US,en;q=0.9'

    def fetch_grants(self):
        grants_data = []
        scraped_urls = set()

        calls = self._scrape_calls_page()
        for call in calls:
            title_lower = call.get('title', '').lower()
            if any(closed in title_lower for closed in CLOSED_PROGRAMS):
                print(f"  Skipping closed program: {call['title'][:50]}")
                continue
            scraped_urls.add(call['url'])
            grants_data.append(call)

        for prog in KNOWN_PROGRAMS:
            if prog['url'] not in scraped_urls:
                grants_data.append({
                    'title': prog['title'],
                    'url': prog['url'],
                    'description': prog['description'],
                    'deadline_text': None,
                    'amount_text': prog.get('amount_text', ''),
                    'status_text': 'open',
                    'eligibility': prog.get('eligibility', ''),
                    'category': prog.get('category', 'innovation'),
                })
                print(f"  Added known program: {prog['title'][:50]}")

        print(f"  Total Business Finland grants: {len(grants_data)}")
        return grants_data

    def _scrape_calls_page(self):
        calls = []

        soup = self.fetch_page_playwright(
            self.calls_url,
            wait_selector='main',
            timeout=30000
        )

        if not soup:
            soup = self.fetch_page(self.calls_url)

        if not soup:
            print("  Could not fetch Business Finland calls page")
            return calls

        main = soup.find('main') or soup

        call_items = main.find_all(['article', 'div', 'li'], class_=lambda c: c and any(
            w in str(c).lower() for w in ['card', 'item', 'call', 'listing', 'result']
        ))

        if not call_items:
            call_items = main.find_all('a', href=True)
            call_items = [a for a in call_items if '/funding/' in a.get('href', '') and len(a.get_text(strip=True)) > 10]

        for item in call_items[:30]:
            try:
                link = item.find('a', href=True) if item.name != 'a' else item
                if not link:
                    continue

                href = link.get('href', '')
                if not href.startswith('http'):
                    href = 'https://www.businessfinland.fi' + href

                if '/calls/' in href and href == self.calls_url:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue

                title_lower = title.lower()
                if any(closed in title_lower for closed in CLOSED_PROGRAMS):
                    continue

                deadline_text = None
                status_text = 'open'
                desc_el = item.find(['p', 'span'], class_=lambda c: c and any(
                    w in str(c).lower() for w in ['desc', 'summary', 'intro', 'text']
                )) if item.name != 'a' else None

                description = desc_el.get_text(strip=True) if desc_el else ''

                date_el = item.find(['span', 'time', 'div'], class_=lambda c: c and any(
                    w in str(c).lower() for w in ['date', 'deadline', 'time']
                )) if item.name != 'a' else None
                if date_el:
                    deadline_text = date_el.get_text(strip=True)

                if not description and href not in [self.calls_url]:
                    self.rate_limit(1)
                    detail = self._fetch_detail_page(href)
                    if detail:
                        description = detail.get('description', '')
                        if not deadline_text:
                            deadline_text = detail.get('deadline')

                calls.append({
                    'title': title,
                    'url': href,
                    'description': description,
                    'deadline_text': deadline_text,
                    'amount_text': '',
                    'status_text': status_text,
                    'eligibility': '',
                })
                print(f"  Found call: {title[:50]}")

            except Exception as e:
                print(f"  Error processing call item: {e}")

        return calls

    def _fetch_detail_page(self, url):
        soup = self.fetch_page(url)
        if not soup:
            return None

        result = {}
        main = soup.find('main') or soup.find('article') or soup

        paragraphs = main.find_all('p')
        desc_parts = []
        for p in paragraphs[:12]:
            ptext = p.get_text(strip=True)
            if ptext and len(ptext) > 20:
                desc_parts.append(ptext)
        if desc_parts:
            result['description'] = ' '.join(desc_parts[:8])

        for heading in main.find_all(['h2', 'h3']):
            heading_text = heading.get_text(strip=True).lower()
            if any(w in heading_text for w in ['deadline', 'application period', 'when to apply']):
                sibling = heading.find_next_sibling()
                if sibling:
                    result['deadline'] = sibling.get_text(strip=True)
                    break

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'fi'
        grant['language'] = 'en'
        grant['source_type'] = 'myndighet'

        if not grant.get('keywords'):
            grant['keywords'] = []
        bf_keywords = ['innovation', 'research', 'internationalization', 'export', 'startup']
        for kw in bf_keywords:
            if kw not in grant['keywords']:
                grant['keywords'].append(kw)
        grant['keywords'] = grant['keywords'][:15]

        return grant
