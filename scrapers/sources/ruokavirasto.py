import sys
import os
import re
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class RuokavirastoScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.ruokavirasto.fi/tuet/"
        self.source_name = "Ruokavirasto"
        self.market = 'fi'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Ruokavirasto (Finnish Food Authority)"
        self.default_category = "rural_development"
        self.headers['Accept-Language'] = 'fi-FI,fi;q=0.9'

        self.known_programs = [
            {
                'title': 'Maaseudun yritystuki — Perustamisavustus',
                'title_en': 'Rural Business Grant — Establishment Grant',
                'url': 'https://www.ruokavirasto.fi/tuet/maatalous-ja-maaseutuyrittajyys/maaseudun-yritystuet/perustamisavustus/',
                'description': (
                    'Perustamisavustus on tarkoitettu maaseutualueilla toimivien uusien yritysten perustamiseen. '
                    'Avustus on 5 000–10 000 euroa, ja sitä myönnetään yrityksen perustamisvaiheen kuluihin. '
                    'Tuki on osa Suomen CAP-suunnitelmaa 2023–2027.'
                ),
                'amount_text': '5 000–10 000 euroa',
                'eligibility': (
                    'Yrityksen tulee sijaita maaseutualueella (maaseutuluokituksen mukainen alue). '
                    'Hakijalla tulee olla riittävä osaaminen ja ammattitaito. '
                    'Yritystoiminnan tulee olla päätoimista.'
                ),
            },
            {
                'title': 'Maaseudun yritystuki — Kehittämisavustus',
                'title_en': 'Rural Business Grant — Development Grant',
                'url': 'https://www.ruokavirasto.fi/tuet/maatalous-ja-maaseutuyrittajyys/maaseudun-yritystuet/kehittamisavustus/',
                'description': (
                    'Kehittämisavustus tukee maaseudun yritysten kehittämistoimenpiteitä. '
                    'Tukitaso on enintään 50% hyväksyttävistä kustannuksista, enintään 100 000 euroa. '
                    'Tukea myönnetään esimerkiksi tuotekehitykseen, markkinointiin ja toiminnan laajentamiseen.'
                ),
                'amount_text': 'Enintään 50%, max 100 000 euroa',
                'eligibility': (
                    'Pk-yritykset maaseutualueilla. '
                    'Yrityksen tulee olla toimiva ja kehittämiskelpoinen. '
                    'Hakijalla tulee olla riittävä rahoitus omarahoitusosuuteen.'
                ),
            },
            {
                'title': 'Maatilainvestoinnin avustus',
                'title_en': 'Farm Investment Grant',
                'url': 'https://www.ruokavirasto.fi/tuet/maatalous-ja-maaseutuyrittajyys/investointituet/',
                'description': (
                    'Maatilainvestoinnin avustusta myönnetään maatilojen rakentamis- ja koneinvestointeihin. '
                    'Tukitaso on 20–40% investointikustannuksista, enintään 1,5 miljoonaa euroa. '
                    'Tukea myönnetään tuotantorakennusten rakentamiseen, peruskorjaukseen ja konehankintoihin.'
                ),
                'amount_text': '20–40%, max 1 500 000 euroa',
                'eligibility': (
                    'Maatilat ja maatalousyritykset. '
                    'Hakijalla tulee olla riittävä ammattitaito (vähintään 3 vuotta kokemusta tai koulutus). '
                    'Investoinnin tulee parantaa tilan kilpailukykyä.'
                ),
            },
            {
                'title': 'Nuoren viljelijän aloitustuki',
                'title_en': 'Young Farmer Start-up Support',
                'url': 'https://www.ruokavirasto.fi/tuet/maatalous-ja-maaseutuyrittajyys/nuoren-viljelijan-aloitustuki/',
                'description': (
                    'Nuoren viljelijän aloitustuki on tarkoitettu alle 41-vuotiaille maatalousyrittäjille, '
                    'jotka aloittavat tilanpidon. Tuki koostuu avustuksesta (max 40 000 euroa) ja '
                    'korkotukilainasta (max 250 000 euroa). '
                    'Tuki edistää sukupolvenvaihdoksia maataloudessa.'
                ),
                'amount_text': 'Avustus max 40 000 euroa + korkotukilaina max 250 000 euroa',
                'eligibility': (
                    'Hakijan tulee olla alle 41-vuotias tilanpidon aloittamisen hetkellä. '
                    'Riittävä ammattitaito (koulutus tai kokemus). '
                    'Tilan tulee olla taloudellisesti elinkelpoinen.'
                ),
            },
        ]

    def fetch_grants(self):
        grants_data = []

        soup = self.fetch_page(self.base_url)
        if soup:
            main = soup.find('main') or soup
            links = main.find_all('a', href=True)
            scraped_urls = set()

            for link in links:
                href = link.get('href', '')
                if not href.startswith('http'):
                    href = 'https://www.ruokavirasto.fi' + href
                text = link.get_text(strip=True)

                if ('tuki' in href or 'avustus' in href or 'investointi' in href) and href not in scraped_urls and len(text) > 5:
                    if any(w in text.lower() for w in ['tuki', 'avustus', 'rahoitus']):
                        scraped_urls.add(href)
                        self.rate_limit(1)
                        detail = self._fetch_detail_page(href)
                        if detail and detail.get('description'):
                            grants_data.append({
                                'title': detail.get('title', text),
                                'url': href,
                                'description': detail['description'],
                                'deadline_text': detail.get('deadline'),
                                'amount_text': detail.get('amount', ''),
                                'status_text': 'avoin',
                                'eligibility': detail.get('eligibility', ''),
                            })
                            print(f"  Scraped: {detail.get('title', text)[:60]}")

                    if len(scraped_urls) >= 15:
                        break

        scraped_urls_set = {g['url'] for g in grants_data}
        for prog in self.known_programs:
            if prog['url'] not in scraped_urls_set:
                grants_data.append({
                    'title': prog['title'],
                    'url': prog['url'],
                    'description': prog['description'],
                    'deadline_text': None,
                    'amount_text': prog.get('amount_text', ''),
                    'status_text': 'avoin',
                    'eligibility': prog.get('eligibility', ''),
                })
                print(f"  Added known program: {prog['title'][:60]}")

        print(f"  Total Ruokavirasto grants: {len(grants_data)}")
        return grants_data

    def _fetch_detail_page(self, url):
        soup = self.fetch_page(url)
        if not soup:
            return None

        result = {}

        h1 = soup.find('h1')
        if h1:
            result['title'] = h1.get_text(strip=True)

        main = soup.find('main') or soup.find('article') or soup

        paragraphs = main.find_all('p')
        desc_parts = []
        for p in paragraphs[:12]:
            ptext = p.get_text(strip=True)
            if ptext and len(ptext) > 20:
                desc_parts.append(ptext)
        if desc_parts:
            result['description'] = ' '.join(desc_parts[:8])

        eligibility_parts = []
        for heading in main.find_all(['h2', 'h3']):
            heading_text = heading.get_text(strip=True).lower()
            if any(w in heading_text for w in ['kenelle', 'kuka voi', 'edellytykset', 'ehdot', 'hakijalle']):
                sibling = heading.find_next_sibling()
                while sibling and sibling.name not in ['h2', 'h3']:
                    text = sibling.get_text(strip=True)
                    if text:
                        eligibility_parts.append(text)
                    sibling = sibling.find_next_sibling()
        if eligibility_parts:
            result['eligibility'] = ' '.join(eligibility_parts[:5])

        full_text = main.get_text()
        amount_patterns = [
            r'(?:enintään|korkeintaan|tukitaso)\s+(\d[\d\s,.]*\s*(?:%|euroa|€))',
            r'(\d+\s*[-–]\s*\d+\s*%)',
            r'max\.?\s*(\d[\d\s,.]*\s*euroa)',
        ]
        for pat in amount_patterns:
            match = re.search(pat, full_text, re.IGNORECASE)
            if match:
                result['amount'] = match.group(0)
                break

        return result

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['market'] = 'fi'
        grant['language'] = 'fi'
        grant['source_type'] = 'myndighet'

        if not grant.get('keywords'):
            grant['keywords'] = []
        rural_keywords = ['maatalous', 'maaseutu', 'elintarvike', 'metsä', 'investointi']
        for kw in rural_keywords:
            if kw not in grant['keywords']:
                grant['keywords'].append(kw)
        grant['keywords'] = grant['keywords'][:15]

        return grant
