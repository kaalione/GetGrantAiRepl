import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class EnergimyndighetenScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://www.energimyndigheten.se/stod-och-utlysningar/"
        self.source_name = "Energimyndigheten"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Energimyndigheten"
        self.default_category = "energy"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        pages = [
            self.base_url,
            "https://www.energimyndigheten.se/stod-och-utlysningar/sok-hantera-och-redovisa-stod/alla-utlysningar/",
            "https://www.energimyndigheten.se/forskning-och-innovation/utlysningar/",
        ]

        max_dynamic = 30
        for page_url in pages:
            soup = self.fetch_page(page_url)
            if not soup:
                continue

            links = soup.select('a[href]')
            for link in links:
                if len(grants_data) >= max_dynamic:
                    break
                href = link.get('href', '')
                if not href or href == '#':
                    continue

                if not href.startswith('http'):
                    href = 'https://www.energimyndigheten.se' + href

                if 'energimyndigheten.se' not in href:
                    continue

                is_relevant = (
                    '/stod-och-utlysningar/' in href
                    or '/ekonomiska-stod' in href
                    or '/forskning-och-innovation/utlysningar/' in href
                )
                if not is_relevant:
                    continue

                skip_patterns = [
                    '/sok-hantera-och-redovisa-stod/$',
                    '/alla-utlysningar/$',
                    '/kommande-utlysningar/$',
                    '/hantera-och-redovisa-stod/$',
                    '/cookie', '/nyhetsbrev', '/kontakt',
                    '/om-oss/', '/mina-sidor', '/e-tjanst',
                    '/redovisa-stod/', '/hantera-beviljat',
                    '/soka-stod/', '/soker-du-stod',
                ]
                skip = False
                for p in skip_patterns:
                    if p.endswith('$'):
                        if href.rstrip('/').endswith(p.rstrip('/$')):
                            skip = True
                            break
                    elif p in href.lower():
                        skip = True
                        break
                if skip:
                    continue
                if href.rstrip('/') == page_url.rstrip('/'):
                    continue

                if href in seen_urls:
                    continue
                seen_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                if title.lower() in ['stöd och utlysningar', 'alla utlysningar', 'forskning och innovation']:
                    continue

                parent = link.find_parent(['li', 'div', 'article', 'tr'])
                status_text = ''
                deadline_text = ''
                if parent:
                    parent_text = parent.get_text(' ', strip=True)
                    status_match = re.search(r'(öppen|stängd|avslutad|pågående|kommande)', parent_text, re.IGNORECASE)
                    if status_match:
                        status_text = status_match.group(1)
                    date_match = re.search(r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})', parent_text, re.IGNORECASE)
                    if date_match:
                        deadline_text = date_match.group(1)
                    if not date_match:
                        date_match2 = re.search(r'(\d{4}-\d{2}-\d{2})', parent_text)
                        if date_match2:
                            deadline_text = date_match2.group(1)

                category = self._categorize(title)
                raw = {
                    'title': title,
                    'url': href,
                    'status_text': status_text,
                    'deadline_text': deadline_text,
                    'description': '',
                    'eligibility': '',
                    'amount_text': '',
                    'category': category,
                }

                self.rate_limit()
                self._enrich_detail(raw)
                grants_data.append(raw)
                print(f"  Found: {title[:60]}")

            self.rate_limit()

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] in seen_urls:
                continue
            seen_urls.add(prog['url'])
            grants_data.append(prog)
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['forskning', 'forskningsprojekt']):
            return 'research'
        if any(w in t for w in ['klimat', 'hållbar']):
            return 'sustainability'
        if any(w in t for w in ['transport', 'fordon', 'ladda']):
            return 'transport'
        return self.default_category

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return
        desc_elem = detail.select_one('article, .main-content, main, .content')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            raw['description'] = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

        page_text = detail.get_text(' ', strip=True)
        if not raw.get('deadline_text'):
            date_match = re.search(r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})', page_text, re.IGNORECASE)
            if date_match:
                raw['deadline_text'] = date_match.group(1)

        if not raw.get('amount_text'):
            amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
            if amount_match:
                raw['amount_text'] = amount_match.group(1)

        if 'forskare' in page_text.lower() or 'forskning' in page_text.lower():
            raw['category'] = 'research'

    def _get_known_programs(self):
        base = "https://www.energimyndigheten.se"
        programs = [
            {"title": "Industriklivet - stöd till industrins klimatomställning", "path": "/stod-och-utlysningar/industriklivet/", "eligibility": "industriföretag, kommuner, regioner", "category": "energy"},
            {"title": "Energisteg - stöd för energieffektivisering i industrin", "path": "/stod-och-utlysningar/energisteg/", "eligibility": "industriföretag", "category": "energy"},
            {"title": "Ladda bilen - stöd för laddinfrastruktur", "path": "/stod-och-utlysningar/ladda-bilen/", "eligibility": "privatpersoner, bostadsrättsföreningar, företag", "category": "transport"},
            {"title": "Energikartläggningsstöd för företag", "path": "/effektiv-energianvandning/foretag/ekonomiska-stod-och-radgivning/energikartlaggningsstod/", "eligibility": "små och medelstora företag", "category": "energy"},
            {"title": "Solelstöd - stöd för solcellsinstallation", "path": "/stod-och-utlysningar/solcellsstod/", "eligibility": "företag, offentliga organisationer, privatpersoner", "category": "energy"},
            {"title": "Robust kommun - investeringsstödprogram", "path": "/energiberedskap/energiberedskap-for-offentlig-sektor/robust-kommun-investeringsstodprogram/", "eligibility": "kommuner och regioner", "category": "energy"},
            {"title": "Ekonomiska stöd och rådgivning för företag", "path": "/effektiv-energianvandning/foretag/ekonomiska-stod-och-radgivning/", "eligibility": "företag", "category": "energy"},
            {"title": "Ekonomiska stöd för yrkesverksamma", "path": "/effektiv-energianvandning/yrkesverksamma/ekonomiska-stod-och-radgivning/", "eligibility": "yrkesverksamma inom energisektorn", "category": "energy"},
            {"title": "Forskning om förnybar energi", "path": "/forskning-och-innovation/utlysningar/fornybar-energi/", "eligibility": "forskare, universitet, företag", "category": "research"},
            {"title": "Forskning om energieffektivisering", "path": "/forskning-och-innovation/utlysningar/energieffektivisering/", "eligibility": "forskare, universitet, företag", "category": "research"},
            {"title": "Forskning om energisystem och elnät", "path": "/forskning-och-innovation/utlysningar/energisystem/", "eligibility": "forskare, universitet, företag", "category": "research"},
            {"title": "Stöd till energilagring och batterier", "path": "/forskning-och-innovation/utlysningar/energilagring/", "eligibility": "forskare och företag inom energilagring", "category": "research"},
            {"title": "Bioenergi - forskning och utveckling", "path": "/forskning-och-innovation/utlysningar/bioenergi/", "eligibility": "forskare och företag inom bioenergi", "category": "research"},
            {"title": "Vätgas och bränsleceller", "path": "/forskning-och-innovation/utlysningar/vatgas/", "eligibility": "forskare, företag, myndigheter", "category": "research"},
            {"title": "Klimatpremie för tunga fordon", "path": "/stod-och-utlysningar/klimatpremie/", "eligibility": "företag som köper tunga elfordon eller biogasfordon", "category": "transport"},
            {"title": "Stöd för vindkraft", "path": "/forskning-och-innovation/utlysningar/vindkraft/", "eligibility": "forskare och företag inom vindkraft", "category": "research"},
            {"title": "Smart och förnybar energi i bebyggelsen", "path": "/forskning-och-innovation/utlysningar/smart-energi-bebyggelse/", "eligibility": "forskare, fastighetsägare, kommuner", "category": "energy"},
            {"title": "Transporteffektivitet - stöd för hållbar transport", "path": "/forskning-och-innovation/utlysningar/transporteffektivitet/", "eligibility": "forskare, transportföretag, kommuner", "category": "transport"},
            {"title": "Elfordon och elektrifiering av transporter", "path": "/forskning-och-innovation/utlysningar/elfordon/", "eligibility": "forskare, fordonstillverkare, transportföretag", "category": "transport"},
            {"title": "Stöd till elnätsutbyggnad och smarta nät", "path": "/forskning-och-innovation/utlysningar/smarta-elnat/", "eligibility": "elnätsbolag, forskare, teknikföretag", "category": "energy"},
            {"title": "Stöd för hållbara drivmedel", "path": "/forskning-och-innovation/utlysningar/hallbara-drivmedel/", "eligibility": "företag och forskare inom drivmedelsproduktion", "category": "energy"},
            {"title": "Energipilot - stöd för pilotprojekt", "path": "/stod-och-utlysningar/energipilot/", "eligibility": "företag och organisationer med innovativa energilösningar", "category": "energy"},
            {"title": "Stöd för energieffektivisering i flerbostadshus", "path": "/stod-och-utlysningar/energieffektivisering-flerbostadshus/", "eligibility": "fastighetsägare, bostadsrättsföreningar", "category": "energy"},
            {"title": "Stöd för geotermisk energi", "path": "/forskning-och-innovation/utlysningar/geotermi/", "eligibility": "forskare och företag inom geotermi", "category": "research"},
            {"title": "Innovationsstöd för små och medelstora energiföretag", "path": "/stod-och-utlysningar/innovationsstod-sme/", "eligibility": "små och medelstora energiföretag", "category": "energy"},
        ]
        results = []
        for prog in programs:
            url = base + prog['path']
            results.append({
                'title': prog['title'],
                'url': url,
                'description': '',
                'eligibility': prog.get('eligibility', ''),
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': prog.get('category', self.default_category),
            })
        return results


if __name__ == "__main__":
    scraper = EnergimyndighetenScraper()
    scraper.scrape()
