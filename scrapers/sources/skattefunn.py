import sys
import os
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class SkatteFUNNScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.forskningsradet.no/skattefunn/"
        self.source_name = "SkatteFUNN"
        self.market = 'no'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Norges forskningsråd / Skatteetaten"
        self.default_category = "tax_incentive"
        self.headers['Accept-Language'] = 'nb-NO,nb;q=0.9,no;q=0.8'

    def fetch_grants(self):
        grants_data = []

        soup = self.fetch_page(self.base_url)

        description_parts = []
        eligibility_parts = []

        if soup:
            main = soup.find('main') or soup.find('article') or soup
            paragraphs = main.find_all('p')
            for p in paragraphs[:15]:
                ptext = p.get_text(strip=True)
                if ptext and len(ptext) > 20:
                    description_parts.append(ptext)

            for heading in main.find_all(['h2', 'h3']):
                heading_text = heading.get_text(strip=True).lower()
                if any(w in heading_text for w in ['hvem kan', 'krav', 'vilkår', 'forutsetning']):
                    sibling = heading.find_next_sibling()
                    while sibling and sibling.name not in ['h2', 'h3']:
                        text = sibling.get_text(strip=True)
                        if text:
                            eligibility_parts.append(text)
                        sibling = sibling.find_next_sibling()

        description = ' '.join(description_parts[:6]) if description_parts else (
            'SkatteFUNN er en skattefradragsordning for bedrifter med forsknings- og utviklingsaktiviteter (FoU). '
            'Ordningen gir 19% skattefradrag av godkjente FoU-kostnader, opp til NOK 25 millioner per år. '
            'Maksimal skattelettelse er ca. NOK 4,75 millioner per år. '
            'Dersom bedriften ikke har skattbar inntekt, utbetales fradraget kontant. '
            'Ca. 4 000 norske bedrifter benytter SkatteFUNN hvert år. '
            'Rullende søknadsfrist — ingen deadline.'
        )

        eligibility = ' '.join(eligibility_parts[:5]) if eligibility_parts else (
            'Alle norske bedrifter med FoU-aktiviteter kan søke. '
            'Bedriften må være skattepliktig til Norge. '
            'FoU-prosjektet må være målrettet og avgrenset.'
        )

        grants_data.append({
            'title': 'SkatteFUNN — Skattefradrag for forskning og utvikling',
            'url': self.base_url,
            'description': description,
            'deadline_text': None,
            'amount_text': 'NOK 25 000 000 kostnadsbas per år. 19% skattefradrag. Maks NOK 4 750 000 per år.',
            'status_text': 'åpen',
            'eligibility': eligibility,
        })

        print(f"  Scraped SkatteFUNN (1 tax incentive program)")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'no'
        grant['language'] = 'nb'
        grant['source_type'] = 'skatteincitament'
        grant['amount_min'] = None
        grant['amount_max'] = 4750000
        grant['status'] = 'open'

        grant['keywords'] = ['forskning', 'utvikling', 'innovation', 'skattefradrag', 'fou', 'næringsliv']
        grant['target_group'] = ['sme', 'large_enterprise', 'startup']

        return grant
