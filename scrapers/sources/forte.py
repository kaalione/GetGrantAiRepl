import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class ForteScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://forte.se/sok-finansiering/utlysningar"
        self.source_name = "Forte"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Forte"
        self.default_category = "research"
        self.default_eligibility = "forskare med doktorsexamen, universitet, högskolor"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        soup = self.fetch_page(self.base_url)
        if not soup:
            soup = self.fetch_page_playwright(self.base_url)

        if soup:
            self._extract_calls_from_listing(soup, grants_data, seen_urls)

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

    def _extract_calls_from_listing(self, soup, grants_data, seen_urls):
        links = soup.select('a[href*="/utlysningar/"]')

        extra = soup.select('a[href]')
        for a in extra:
            href = a.get('href', '')
            if '/utlysningar/' in href and a not in links:
                links.append(a)

        nav_footer = soup.select('nav a, footer a, header a')
        nav_footer_hrefs = set(a.get('href', '') for a in nav_footer)

        current_status = ''
        for link in links:
            href = link.get('href', '')
            if not href or href == '#' or href.startswith('mailto:'):
                continue

            if href.rstrip('/') == self.base_url.rstrip('/'):
                continue
            if href in nav_footer_hrefs:
                continue

            if not href.startswith('http'):
                href = 'https://forte.se' + href

            if 'forte.se' not in href:
                continue
            if '/utlysningar/' not in href:
                continue
            if href.rstrip('/').endswith('/utlysningar'):
                continue

            if href in seen_urls:
                continue
            seen_urls.add(href)

            title = link.get_text(strip=True)
            if not title or len(title) < 8:
                continue
            if title.lower() in ['utlysningar', 'sök finansiering', 'alla utlysningar', 'sok finansiering']:
                continue

            parent = link.find_parent(['li', 'div', 'article', 'section', 'tr'])
            status_text = ''
            deadline_text = ''
            description = ''

            if parent:
                parent_text = parent.get_text(' ', strip=True)

                status_match = re.search(r'(Kommande|Öppna?|Stängd[a]?|Beslutade?|Pågående)', parent_text, re.IGNORECASE)
                if status_match:
                    status_text = status_match.group(1)

                date_match = re.search(
                    r'(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                    parent_text, re.IGNORECASE
                )
                if date_match:
                    deadline_text = date_match.group(1)

                desc_elem = parent.find('p')
                if desc_elem:
                    description = desc_elem.get_text(strip=True)

            ancestors = link.find_parents(['div', 'section'])
            for ancestor in ancestors:
                heading = ancestor.find_previous_sibling(['h2', 'h3', 'h4'])
                if heading:
                    heading_text = heading.get_text(strip=True)
                    if re.search(r'(Kommande|Öppna|Stängda|Beslutade)', heading_text, re.IGNORECASE):
                        if not status_text:
                            status_match = re.search(r'(Kommande|Öppna|Stängda|Beslutade)', heading_text, re.IGNORECASE)
                            if status_match:
                                status_text = status_match.group(1)
                        break

            category = self._categorize(title)

            raw = {
                'title': title,
                'url': href,
                'description': description,
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': status_text,
                'deadline_text': deadline_text,
                'category': category,
            }

            self.rate_limit()
            self._enrich_detail(raw)
            grants_data.append(raw)
            print(f"  Found: {title[:60]}")

    def _enrich_detail(self, raw):
        detail = self.fetch_page(raw['url'])
        if not detail:
            return

        desc_elem = detail.select_one('article, .main-content, main, .content, .entry-content')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            desc = ' '.join(p.get_text(strip=True) for p in paragraphs[:6])
            if desc and (not raw.get('description') or len(desc) > len(raw['description'])):
                raw['description'] = desc

        page_text = detail.get_text(' ', strip=True)

        if not raw.get('deadline_text'):
            date_match = re.search(
                r'(?:sista\s*(?:ansöknings)?dag|stänger|deadline|sista\s*dag)[:\s]*(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                page_text, re.IGNORECASE
            )
            if date_match:
                raw['deadline_text'] = date_match.group(1)
            else:
                date_match = re.search(
                    r'(?:öppnar|opens)[:\s]*(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
                    page_text, re.IGNORECASE
                )
                if date_match and not raw.get('deadline_text'):
                    raw['deadline_text'] = date_match.group(1)

        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
        if amount_match and not raw.get('amount_text'):
            raw['amount_text'] = amount_match.group(1)

        if not raw.get('eligibility') or raw['eligibility'] == self.default_eligibility:
            elig_match = re.search(r'(?:vem kan söka|behörighet|sökande|kan söka)[:\s]*([^.]+\.)', page_text, re.IGNORECASE)
            if elig_match:
                raw['eligibility'] = elig_match.group(1).strip()

        if not raw.get('status_text'):
            status_match = re.search(r'(Kommande|Öppen|Stängd|Beslutad)', page_text, re.IGNORECASE)
            if status_match:
                raw['status_text'] = status_match.group(1)

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['hälsa', 'psykisk', 'vård', 'omsorg']):
            return 'health'
        if any(w in t for w in ['arbete', 'arbetsliv', 'arbetsmarknad']):
            return 'work'
        if any(w in t for w in ['välfärd', 'socialt', 'social']):
            return 'welfare'
        if any(w in t for w in ['barn', 'ungdom', 'fritid']):
            return 'youth'
        return self.default_category

    def _get_known_programs(self):
        base = "https://forte.se/sok-finansiering/utlysningar"
        programs = [
            {
                'title': 'Samverkan i praktiken för psykisk hälsa 2026',
                'url': f'{base}/samverkan-i-praktiken-for-psykisk-halsa-2026/',
                'description': 'Utlysning för forskningsprojekt som fokuserar på samverkan i praktiken för att förbättra psykisk hälsa. Kommande utlysning som öppnar 17 mars 2026.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'kommande',
                'deadline_text': '',
                'category': 'health',
            },
            {
                'title': 'Fritidens betydelse för barns hälsa 2026',
                'url': f'{base}/fritidens-betydelse-for-barns-halsa-2026/',
                'description': 'Utlysning för forskningsprojekt om fritidens betydelse för barns hälsa och välbefinnande. Kommande utlysning som öppnar 19 maj 2026.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'kommande',
                'deadline_text': '',
                'category': 'youth',
            },
            {
                'title': 'Forte - Projektbidrag inom hälsa, arbetsliv och välfärd',
                'url': f'{base}/projektbidrag/',
                'description': 'Fortes öppna utlysning för projektbidrag inom hälsa, arbetsliv och välfärd. Forte finansierar forskning som bidrar till samhällets utveckling inom hälsa, arbetsliv och välfärd.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'research',
            },
            {
                'title': 'Forte - Juniorforskarbidrag',
                'url': f'{base}/juniorforskarbidrag/',
                'description': 'Bidrag för juniora forskare inom Fortes ansvarsområden: hälsa, arbetsliv och välfärd. Riktar sig till forskare i tidigt karriärskede.',
                'eligibility': 'juniora forskare med doktorsexamen, max 7 år sedan disputation',
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'research',
            },
            {
                'title': 'Forte - Seniorforskarbidrag',
                'url': f'{base}/seniorforskarbidrag/',
                'description': 'Bidrag för seniora forskare inom hälsa, arbetsliv och välfärd. Långsiktigt stöd för etablerade forskare.',
                'eligibility': 'seniora forskare med fast anställning vid universitet eller högskola',
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'research',
            },
            {
                'title': 'Forte - Forskningsprogram inom psykisk hälsa',
                'url': f'{base}/forskningsprogram-psykisk-halsa/',
                'description': 'Forskningsprogram med fokus på psykisk hälsa och ohälsa. Forte satsar på tvärvetenskaplig forskning för att minska psykisk ohälsa i samhället.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'health',
            },
            {
                'title': 'Forte - Forskning om arbetsliv och arbetsmarknad',
                'url': f'{base}/forskning-arbetsliv/',
                'description': 'Utlysning för forskning om arbetsliv, arbetsmarknad och arbetsvillkor. Forte stödjer forskning som bidrar till ett hållbart och inkluderande arbetsliv.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'work',
            },
            {
                'title': 'Forte - Forskning om äldres hälsa och omsorg',
                'url': f'{base}/forskning-aldres-halsa/',
                'description': 'Utlysning för forskning om äldres hälsa, omsorg och välfärd. Forte stödjer forskning som bidrar till förbättrad äldreomsorg.',
                'eligibility': self.default_eligibility,
                'amount_text': '',
                'status_text': 'open',
                'deadline_text': '',
                'category': 'health',
            },
        ]
        return programs


if __name__ == "__main__":
    scraper = ForteScraper()
    scraper.scrape()
