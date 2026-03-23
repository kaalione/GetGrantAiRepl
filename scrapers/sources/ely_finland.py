import sys
import os
import re
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class ElyFinlandScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.ely-keskus.fi/fi/yritykset/avustukset"
        self.source_name = "ELY-keskus"
        self.organization = "ELY-keskukset / Elinvoimakeskus"
        self.default_category = "business_development"
        self.headers['Accept-Language'] = 'fi-FI,fi;q=0.9'

        self.known_programs = [
            {
                'title': 'Yrityksen kehittämisavustus — Kehittämistoimenpiteet',
                'title_en': 'Business Development Grant — Development Activities',
                'url': 'https://www.ely-keskus.fi/fi/yrityksen-kehittamisavustus',
                'description': (
                    'Yrityksen kehittämisavustusta voidaan myöntää pk-yrityksille, joilla on edellytykset '
                    'kannattavaan liiketoimintaan ja riittävästi omia voimavaroja. Avustusta myönnetään '
                    'kehittämistoimenpiteisiin: uuden liiketoiminnan kehittäminen, tuotekehitys, kansainvälistyminen, '
                    'tuottavuuden parantaminen ja muu kehittäminen. Tukitaso on enintään 50% hyväksyttävistä '
                    'kehittämiskustannuksista.'
                ),
                'amount_text': 'Enintään 50% kehittämiskustannuksista',
                'eligibility': (
                    'Pk-yritykset (pienet ja keskisuuret yritykset). '
                    'Yrityksellä tulee olla edellytykset kannattavaan liiketoimintaan. '
                    'Ei myönnetä: maatalouden alkutuotanto, kalatalous, kuljetus, energiantuotanto.'
                ),
            },
            {
                'title': 'Yrityksen kehittämisavustus — Investoinnit',
                'title_en': 'Business Development Grant — Investments',
                'url': 'https://www.ely-keskus.fi/fi/yrityksen-kehittamisavustus-investoinnit',
                'description': (
                    'Yrityksen kehittämisavustusta voidaan myöntää investointeihin, kuten kone- ja '
                    'laitehankintoihin sekä toimitilojen rakentamiseen tai laajentamiseen. '
                    'Tukitaso vaihtelee 10–35% investointikustannuksista alueesta ja yrityksen koosta riippuen. '
                    'Korkeampi tuki itäisessä ja pohjoisessa Suomessa (rakennerahastoalueet).'
                ),
                'amount_text': '10-35% investointikustannuksista, korkeampi tuki Itä- ja Pohjois-Suomessa',
                'eligibility': (
                    'Pk-yritykset. Korkeampi tukitaso Itä- ja Pohjois-Suomen rakennerahastoalueilla. '
                    'Ei myönnetä: maatalouden alkutuotanto, kalatalous, kuljetus, energiantuotanto.'
                ),
            },
            {
                'title': 'Toimintaympäristön kehittämisavustus',
                'title_en': 'Operating Environment Development Grant',
                'url': 'https://www.ely-keskus.fi/fi/toimintaympariston-kehittamisavustus',
                'description': (
                    'Toimintaympäristön kehittämisavustusta myönnetään voittoa tavoittelemattomille yhteisöille '
                    'ja julkisille toimijoille hankkeisiin, jotka parantavat yritysten toimintaympäristöä. '
                    'Hankkeilla tuetaan yritysten perustamista, kasvua ja kehittymistä alueella.'
                ),
                'amount_text': 'Enintään 80% hyväksyttävistä kustannuksista',
                'eligibility': (
                    'Voittoa tavoittelemattomat yhteisöt ja julkiset toimijat (kunnat, kehitysyhtiöt). '
                    'Ei suoraan yrityksille.'
                ),
            },
            {
                'title': 'Alueellinen kuljetustuki',
                'title_en': 'Regional Transport Subsidy',
                'url': 'https://www.ely-keskus.fi/fi/alueellinen-kuljetustuki',
                'description': (
                    'Alueellista kuljetustukea myönnetään harvaan asuttujen alueiden pk-yrityksille, '
                    'joilla on kohtuuttoman suuret kuljetuskustannukset syrjäisen sijainnin vuoksi. '
                    'Tuki korvaa osan pitkien kuljetusmatkojen kustannuksista.'
                ),
                'amount_text': 'Korvaus kuljetuskustannuksista (vaihtelee matkan pituuden mukaan)',
                'eligibility': (
                    'Pk-yritykset harvaan asuttujen alueiden kunnissa. '
                    'Kuljetuskustannusten tulee olla kohtuuttoman suuret syrjäisen sijainnin vuoksi.'
                ),
            },
        ]

    def fetch_grants(self):
        grants_data = []

        soup = self.fetch_page(self.base_url)
        if soup:
            main = soup.find('main') or soup.find('article') or soup
            links = main.find_all('a', href=True)
            scraped_urls = set()

            for link in links:
                href = link.get('href', '')
                if not href.startswith('http'):
                    href = 'https://www.ely-keskus.fi' + href
                text = link.get_text(strip=True)

                if ('avustus' in href or 'tuki' in href or 'kehittämis' in text.lower()) and href not in scraped_urls and len(text) > 5:
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
                        print(f"  Scraped from site: {detail.get('title', text)[:60]}")

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

        print(f"  Total ELY grants: {len(grants_data)}")
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
            if any(w in heading_text for w in ['kenelle', 'kuka voi', 'edellytykset', 'ehdot', 'kohderyhmä']):
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
            r'(?:enintään|korkeintaan|maksimissaan)\s+([\d\s,.]+\s*(?:%|euroa|€))',
            r'tukitaso[^.]*?(\d+\s*(?:%|euroa|€))',
            r'(\d+\s*-\s*\d+\s*%)',
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
        ely_keywords = ['kehitys', 'pk-yritys', 'investointi', 'liiketoiminta', 'innovaatio']
        for kw in ely_keywords:
            if kw not in grant['keywords']:
                grant['keywords'].append(kw)
        grant['keywords'] = grant['keywords'][:15]

        return grant
