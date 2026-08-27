import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class FinnpartnershipScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.finnpartnership.fi/"
        self.source_name = "Finnpartnership"
        self.market = 'fi'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Finnfund / Ulkoministeriö"
        self.default_category = "international_development"
        self.headers['Accept-Language'] = 'en-US,en;q=0.9,fi;q=0.5'

    def fetch_grants(self):
        grants_data = []

        description_parts = []
        eligibility_parts = []

        soup = self.fetch_page(self.base_url)
        if soup:
            main = soup.find('main') or soup.find('article') or soup
            paragraphs = main.find_all('p')
            for p in paragraphs[:15]:
                ptext = p.get_text(strip=True)
                if ptext and len(ptext) > 20:
                    description_parts.append(ptext)

            for heading in main.find_all(['h2', 'h3']):
                heading_text = heading.get_text(strip=True).lower()
                if any(w in heading_text for w in ['eligible', 'who can', 'criteria', 'requirements']):
                    sibling = heading.find_next_sibling()
                    while sibling and sibling.name not in ['h2', 'h3']:
                        text = sibling.get_text(strip=True)
                        if text:
                            eligibility_parts.append(text)
                        sibling = sibling.find_next_sibling()

        support_url = "https://www.finnpartnership.fi/en/planning-a-project/business-partnership-support/"
        soup2 = self.fetch_page(support_url)
        if soup2:
            main2 = soup2.find('main') or soup2.find('article') or soup2
            for p in main2.find_all('p')[:10]:
                ptext = p.get_text(strip=True)
                if ptext and len(ptext) > 20 and ptext not in description_parts:
                    description_parts.append(ptext)

        description = ' '.join(description_parts[:8]) if description_parts else (
            'Finnpartnership provides Business Partnership Support for Finnish companies expanding '
            'to developing markets in Africa, Asia, Latin America, and other eligible countries. '
            'The programme is financed by the Ministry for Foreign Affairs of Finland. '
            'Support covers up to 85% of eligible project costs for feasibility studies, training, '
            'piloting, and matchmaking activities. Projects must contribute to sustainable development '
            'in the target country, including job creation, technology transfer, and capacity building.'
        )

        eligibility = ' '.join(eligibility_parts[:5]) if eligibility_parts else (
            'Finnish companies or organisations with a viable business plan for a developing market. '
            'The project must contribute to sustainable development in the partner country. '
            'Both SMEs and larger companies are eligible. '
            'The company must have sufficient resources to implement the project.'
        )

        grants_data.append({
            'title': 'Finnpartnership — Business Partnership Support',
            'url': support_url if soup2 else self.base_url,
            'description': description,
            'deadline_text': None,
            'amount_text': 'Up to 85% of eligible costs, continuous application',
            'status_text': 'open',
            'eligibility': eligibility,
            'category': 'international_development',
        })

        matchmaking_url = "https://www.finnpartnership.fi/en/planning-a-project/matchmaking/"
        grants_data.append({
            'title': 'Finnpartnership — Matchmaking Service',
            'url': matchmaking_url,
            'description': (
                'Finnpartnership Matchmaking connects Finnish companies with potential business partners '
                'in developing countries. The service helps identify suitable partners for trade, '
                'investment, and technology transfer projects. Free of charge for Finnish companies.'
            ),
            'deadline_text': None,
            'amount_text': 'Free service',
            'status_text': 'open',
            'eligibility': 'Finnish companies seeking business partners in developing markets.',
            'category': 'international_development',
        })

        print(f"  Scraped Finnpartnership ({len(grants_data)} programs)")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'fi'
        grant['language'] = 'en'
        grant['source_type'] = 'myndighet'

        grant['keywords'] = ['vienti', 'kansainvälistyminen', 'kehitysyhteistyö', 'export',
                             'internationalization', 'sustainable development']
        grant['target_group'] = ['sme', 'large_enterprise']

        return grant
