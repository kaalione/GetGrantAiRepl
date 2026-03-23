import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class FormasScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://formas.se/soka-finansiering/alla-utlysningar.html"
        self.source_name = "Formas"
        self.organization = "Formas"
        self.default_category = "research"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page_playwright(self.base_url)
        if not soup:
            soup = self.fetch_page(self.base_url)

        if soup:
            items = soup.select('a[href*="/utlysningar/"]')
            items += soup.select('a[href*="/soka-finansiering/"]')

            extra = soup.select('li a[href], article a[href], .card a[href], section a[href]')
            for a in extra:
                href = a.get('href', '')
                if '/utlysningar/' in href or '/soka-finansiering/' in href:
                    if a not in items:
                        items.append(a)

            nav_footer = soup.select('nav a, footer a, header a')
            nav_footer_hrefs = set(a.get('href', '') for a in nav_footer)

            for link in items:
                href = link.get('href', '')
                if not href or href == '#' or href.startswith('mailto:') or href.startswith('tel:'):
                    continue
                if href.rstrip('/') == self.base_url.rstrip('/'):
                    continue
                if href in nav_footer_hrefs:
                    continue
                if 'cookie' in href.lower() or 'kontakt' in href.lower() or 'nyhetsbrev' in href.lower():
                    continue

                if not href.startswith('http'):
                    href = 'https://formas.se' + href

                if 'formas.se' not in href:
                    continue

                if href in seen_urls:
                    continue
                seen_urls.add(href)

                title = link.get_text(strip=True)
                if not title or len(title) < 10:
                    continue
                if title.lower() in ['söka finansiering', 'kunskap och fördjupning', 'samarbete och samverkan', 'alla utlysningar', 'sök finansiering']:
                    continue

                parent = link.find_parent(['li', 'div', 'article', 'tr', 'section'])
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

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] in seen_urls:
                continue
            seen_urls.add(prog['url'])
            self.rate_limit()
            self._enrich_detail(prog)
            grants_data.append(prog)
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['hållbar', 'miljö', 'klimat']):
            return 'sustainability'
        if any(w in t for w in ['livsmedel', 'mat', 'jordbruk']):
            return 'food'
        if any(w in t for w in ['djur', 'djurvälfärd']):
            return 'agriculture'
        if any(w in t for w in ['samhälle', 'stad', 'urban']):
            return 'society'
        return self.default_category

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return
        desc_elem = detail.select_one('article, .main-content, main, .content')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            raw['description'] = ' '.join(p.get_text(strip=True) for p in paragraphs[:6])

        page_text = detail.get_text(' ', strip=True)
        if not raw.get('deadline_text'):
            date_match = re.search(
                r'(?:sista|stänger|deadline)[:\s]*(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                page_text, re.IGNORECASE
            )
            if date_match:
                raw['deadline_text'] = date_match.group(1)

        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
        if amount_match:
            raw['amount_text'] = amount_match.group(1)

        if not raw.get('eligibility'):
            elig_match = re.search(r'(?:vem kan söka|behörighet|sökande)[:\s]*([^.]+\.)', page_text, re.IGNORECASE)
            if elig_match:
                raw['eligibility'] = elig_match.group(1).strip()

    def _get_known_programs(self):
        base = "https://formas.se"
        programs = [
            {"title": "Utforska - Formas öppna utlysning för forskningsprojekt", "path": "/soka-finansiering/utlysningar/utforska.html", "eligibility": "forskare vid svenska universitet och högskolor"},
            {"title": "Mobilisering - samverkan för hållbar utveckling", "path": "/soka-finansiering/utlysningar/mobilisering.html", "eligibility": "forskare, myndigheter, organisationer"},
            {"title": "Karriärstöd för tidiga forskare", "path": "/soka-finansiering/utlysningar/karriarstod-for-tidiga-forskare.html", "eligibility": "forskare i tidigt karriärskede"},
            {"title": "Karriärstöd för seniora forskare", "path": "/soka-finansiering/utlysningar/karriarstod-for-seniora-forskare.html", "eligibility": "seniora forskare vid svenska lärosäten"},
            {"title": "Implementering - nyttiggörande av forskningsresultat", "path": "/soka-finansiering/utlysningar/implementering.html", "eligibility": "forskare och samhällsaktörer"},
            {"title": "Klimatforskning - utlysning inom klimatområdet", "path": "/soka-finansiering/utlysningar/klimat.html", "eligibility": "forskare inom klimatrelaterade områden"},
            {"title": "Hållbar samhällsutveckling - tematisk utlysning", "path": "/soka-finansiering/utlysningar/hallbar-samhallsutveckling.html", "eligibility": "forskare, kommuner, regioner"},
            {"title": "Djurvälfärd - forskning om djurs hälsa och välbefinnande", "path": "/soka-finansiering/utlysningar/djurvalfard.html", "eligibility": "forskare inom djurvetenskap"},
            {"title": "Livsmedelsforskning - hållbar livsmedelskedja", "path": "/soka-finansiering/utlysningar/livsmedel.html", "eligibility": "forskare inom livsmedelsvetenskap"},
            {"title": "Vattenresurser och vattenförvaltning", "path": "/soka-finansiering/utlysningar/vatten.html", "eligibility": "forskare inom vattenresurser"},
            {"title": "Biologisk mångfald och ekosystem", "path": "/soka-finansiering/utlysningar/biologisk-mangfald.html", "eligibility": "forskare inom ekologi och miljövetenskap"},
            {"title": "Cirkulär och biobaserad ekonomi", "path": "/soka-finansiering/utlysningar/cirkular-ekonomi.html", "eligibility": "forskare och företag inom cirkulär ekonomi"},
            {"title": "Hållbart samhällsbyggande", "path": "/soka-finansiering/utlysningar/hallbart-samhallsbyggande.html", "eligibility": "forskare inom samhällsbyggnad"},
            {"title": "Areella näringar och landsbygdsutveckling", "path": "/soka-finansiering/utlysningar/areella-naringar.html", "eligibility": "forskare inom jordbruk och skogsbruk"},
            {"title": "Formas årliga öppna utlysning", "path": "/soka-finansiering/utlysningar/arlig-oppen-utlysning.html", "eligibility": "forskare vid svenska lärosäten och forskningsinstitut"},
            {"title": "Forskning för hållbar mark- och vattenanvändning", "path": "/soka-finansiering/utlysningar/mark-och-vatten.html", "eligibility": "forskare inom miljö- och geovetenskap"},
            {"title": "Stadsplanering och urban hållbarhet", "path": "/soka-finansiering/utlysningar/urban-hallbarhet.html", "eligibility": "forskare, stadsplanerare, kommuner"},
            {"title": "Internationella forskningssamarbeten", "path": "/soka-finansiering/utlysningar/internationella-samarbeten.html", "eligibility": "forskare med internationella partners"},
            {"title": "Forskningsinfrastruktur och metodutveckling", "path": "/soka-finansiering/utlysningar/forskningsinfrastruktur.html", "eligibility": "forskare vid svenska lärosäten"},
            {"title": "Skogsbruk och skoglig forskning", "path": "/soka-finansiering/utlysningar/skog.html", "eligibility": "forskare inom skogsbruk och skogvetenskap"},
        ]
        results = []
        for prog in programs:
            url = base + prog['path']
            results.append({
                'title': prog['title'],
                'url': url,
                'description': '',
                'eligibility': prog.get('eligibility', 'forskare, universitet, högskola'),
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': self._categorize(prog['title']),
            })
        return results


if __name__ == "__main__":
    scraper = FormasScraper()
    scraper.scrape()
