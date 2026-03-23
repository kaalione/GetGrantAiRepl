import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class StarttirahaScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.suomi.fi/palvelut/starttiraha-te-palvelut/71ce77e0-3286-4b20-948c-1c60ae6d3a84"
        self.source_name = "Starttiraha"
        self.organization = "TE-palvelut / Kunnat"
        self.default_category = "income_support"
        self.headers['Accept-Language'] = 'fi-FI,fi;q=0.9,en;q=0.5'

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
                if any(w in heading_text for w in ['edellytykset', 'ehdot', 'kuka voi', 'kenelle']):
                    sibling = heading.find_next_sibling()
                    while sibling and sibling.name not in ['h2', 'h3']:
                        text = sibling.get_text(strip=True)
                        if text:
                            eligibility_parts.append(text)
                        sibling = sibling.find_next_sibling()

        description = ' '.join(description_parts[:6]) if description_parts else (
            'Starttiraha on tuki uudelle yrittäjälle yritystoiminnan käynnistämis- ja vakiinnuttamisvaiheessa. '
            'Starttirahaa voi saada työtön työnhakija, palkkatyöstä, opiskelusta tai kotityöstä kokoaikaiseksi yrittäjäksi siirtyvä henkilö. '
            'Starttirahan perusosa on 37,21 euroa päivässä (noin 740 euroa kuukaudessa). '
            'Tukea myönnetään enintään 12 kuukautta. '
            'Starttiraha haetaan TE-palveluista tai kunnallisesta työllisyyspalvelusta ENNEN yritystoiminnan aloittamista. '
            'Yrittäjyyden tulee olla päätoimista ja yritysidealla tulee olla edellytykset kannattavaan liiketoimintaan.'
        )

        eligibility = ' '.join(eligibility_parts[:5]) if eligibility_parts else (
            'Hakijan tulee olla työtön työnhakija, palkkatyössä, opiskelija tai kotityössä oleva henkilö. '
            'Yrittäjyys tulee olla päätoimista. '
            'Yritystoimintaa ei saa aloittaa ennen starttirahan myöntämispäätöstä. '
            'Hakijalla tulee olla riittävät valmiudet yrittäjyyteen. '
            'Yritysidealla tulee olla edellytykset jatkuvaan kannattavaan liiketoimintaan.'
        )

        grants_data.append({
            'title': 'Starttiraha — Tuki uudelle yrittäjälle',
            'url': self.base_url,
            'description': description,
            'deadline_text': None,
            'amount_text': '37,21 euroa päivässä, noin 740 euroa kuukaudessa, enintään 12 kuukautta',
            'status_text': 'avoin',
            'eligibility': eligibility,
            'category': 'income_support',
        })

        print(f"  Scraped Starttiraha (1 income support program)")
        return grants_data

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'fi'
        grant['language'] = 'fi'
        grant['source_type'] = 'tulotuki'
        grant['amount_min'] = None
        grant['amount_max'] = 8880
        grant['status'] = 'open'

        grant['keywords'] = ['yrittäjyys', 'startup', 'starttiraha', 'tuki', 'uusi yritys']
        grant['target_group'] = ['startup', 'sole_proprietor']

        return grant
