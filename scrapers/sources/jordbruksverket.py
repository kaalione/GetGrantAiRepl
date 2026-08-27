import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class JordbruksverketScraper(BaseScraper):
    def __init__(self, source_id=None):
        super().__init__(source_id)
        self.base_url = "https://jordbruksverket.se/stod"
        self.source_name = "Jordbruksverket"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.organization = "Jordbruksverket"
        self.default_category = "agriculture"

    def fetch_grants(self):
        grants_data = []
        seen_urls = set()

        category_pages = [
            "https://jordbruksverket.se/stod",
            "https://jordbruksverket.se/stod/jordbruk-tradgard-och-rennaring",
            "https://jordbruksverket.se/stod/fiske-och-vattenbruk",
            "https://jordbruksverket.se/stod/lokalt-ledd-utveckling-genom-leader",
            "https://jordbruksverket.se/stod/utlysningar-och-upphandlingar",
            "https://jordbruksverket.se/stod/innovationsprojekt-inom-eip",
        ]
        cat_set = set(u.rstrip('/') for u in category_pages)

        skip_patterns = ['sam-ansokan', 'vanliga-fragor', 'kontakta-oss', 'blanketter',
                         'logga-in', 'nyheter', 'press', 'english', 'om-jordbruksverket',
                         'skriv-ut', 'cookie', 'lyssna', 'dela-sidan']
        skip_titles = ['skriv ut', 'lyssna', 'dela', 'stäng', 'meny', 'kontakt', 'sök']

        all_links = {}
        for cat_url in category_pages:
            soup = self.fetch_page(cat_url)
            if not soup:
                continue

            for link in soup.select('a[href*="/stod/"]'):
                href = link.get('href', '')
                text = link.get_text(strip=True)
                if not href or not text or len(text) < 5:
                    continue
                if not href.startswith('http'):
                    href = 'https://jordbruksverket.se' + href
                if 'jordbruksverket.se' not in href or '/stod/' not in href:
                    continue
                if href.rstrip('/') in cat_set:
                    continue
                if any(s in href.lower() for s in skip_patterns):
                    continue
                all_links[href] = text

        print(f"  Found {len(all_links)} sub-category links")

        for href, text in list(all_links.items())[:20]:
            if href in seen_urls:
                continue
            seen_urls.add(href)

            soup = self.fetch_page(href)
            if not soup:
                continue

            title_el = soup.select_one('h1')
            page_title = title_el.get_text(strip=True) if title_el else text
            if page_title and len(page_title) > 5 and page_title.lower() not in ['stöd', 'stöd och ersättningar']:
                raw = self._make_raw(href, page_title)
                self._enrich_from_soup(raw, soup)
                grants_data.append(raw)
                print(f"  Found: {page_title[:60]}")

            for inner_link in soup.select('a[href*="/stod/"]'):
                inner_href = inner_link.get('href', '')
                inner_text = inner_link.get_text(strip=True)
                if not inner_href or not inner_text or len(inner_text) < 5:
                    continue
                if not inner_href.startswith('http'):
                    inner_href = 'https://jordbruksverket.se' + inner_href
                if inner_href in seen_urls or inner_href.rstrip('/') in cat_set:
                    continue
                if any(s in inner_href.lower() for s in skip_patterns):
                    continue
                if inner_href in all_links:
                    continue
                if inner_text.lower().strip() in skip_titles:
                    continue
                seen_urls.add(inner_href)
                raw = self._make_raw(inner_href, inner_text)
                grants_data.append(raw)
                print(f"  Found (inner): {inner_text[:60]}")

        known = self._get_known_programs()
        for prog in known:
            if prog['url'] in seen_urls:
                continue
            seen_urls.add(prog['url'])
            grants_data.append(prog)
            print(f"  Found (known): {prog['title'][:60]}")

        print(f"  Total items found: {len(grants_data)}")
        return grants_data

    def _make_raw(self, url, title):
        return {
            'title': title,
            'url': url,
            'description': '',
            'eligibility': '',
            'amount_text': '',
            'status_text': 'open',
            'deadline_text': '',
            'category': self._categorize(title),
        }

    def _categorize(self, title):
        t = title.lower()
        if any(w in t for w in ['landsbygd', 'leader', 'bredband']):
            return 'rural'
        if any(w in t for w in ['djur', 'djurhållning', 'djurvälfärd', 'nötkreatur']):
            return 'agriculture'
        if any(w in t for w in ['livsmedel', 'mat', 'förädling']):
            return 'food'
        if any(w in t for w in ['miljö', 'klimat', 'ekologisk', 'biologisk']):
            return 'environment'
        if any(w in t for w in ['invest', 'modernisering']):
            return 'investment'
        if any(w in t for w in ['fiske', 'vattenbruk', 'havs']):
            return 'fishing'
        return self.default_category

    def _enrich_from_soup(self, raw, detail):
        desc_elem = detail.select_one('article, .main-content, main, .content')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            raw['description'] = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

        page_text = detail.get_text(' ', strip=True)

        date_match = re.search(
            r'(?:sista|stänger|ansök\s*senast)[:\s]*(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
            page_text, re.IGNORECASE
        )
        if date_match:
            raw['deadline_text'] = date_match.group(1)

        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
        if amount_match:
            raw['amount_text'] = amount_match.group(1)

        page_lower = page_text.lower()
        if any(w in page_lower for w in ['löpande', 'ansökan är öppen', 'ansök nu']):
            raw['status_text'] = 'öppen'
        elif any(w in page_lower for w in ['stängd', 'avslutad', 'kan inte sökas']):
            raw['status_text'] = 'stängd'

        eligibility_parts = []
        for heading in detail.select('h2, h3, h4'):
            h_text = heading.get_text(strip=True).lower()
            elig_kw = ['vem kan söka', 'vem kan få', 'vilka kan söka', 'vilka krav',
                       'målgrupp', 'villkor för', 'vem gäller', 'förutsättning',
                       'vem riktar sig', 'det här kan du söka', 'du som kan söka', 'krav för att']
            if any(w in h_text for w in elig_kw):
                sibling = heading.find_next_sibling()
                section_text = []
                while sibling and sibling.name not in ['h2', 'h3', 'h4']:
                    txt = sibling.get_text(strip=True)
                    if txt:
                        section_text.append(txt)
                    sibling = sibling.find_next_sibling()
                if section_text:
                    eligibility_parts.append(' '.join(section_text))

        if not eligibility_parts:
            elig_match = re.search(
                r'(?:vem\s+kan\s+(?:söka|få)|vilka\s+kan\s+söka|riktar\s+sig\s+till|du\s+som\s+kan)[:\s]*([^.]+\.(?:[^.]+\.)?)',
                page_text, re.IGNORECASE
            )
            if elig_match:
                eligibility_parts.append(elig_match.group(1).strip())

        if eligibility_parts:
            raw['eligibility'] = ' '.join(eligibility_parts)

    def _get_known_programs(self):
        base = "https://jordbruksverket.se"
        programs = [
            {"title": "Gårdsstöd", "path": "/stod/jordbruk-tradgard-och-rennaring/jordbruksmark/gardsstod", "eligibility": "Jordbrukare med minst 4 hektar jordbruksmark"},
            {"title": "Förgröningsstöd", "path": "/stod/jordbruk-tradgard-och-rennaring/jordbruksmark/forgroningsstod", "eligibility": "Jordbrukare som söker gårdsstöd"},
            {"title": "Nötkreatursstöd", "path": "/stod/jordbruk-tradgard-och-rennaring/djur/notkreatursstod", "eligibility": "Lantbrukare med nötkreatur"},
            {"title": "Stöd till unga jordbrukare", "path": "/stod/jordbruk-tradgard-och-rennaring/nystartade-foretag-och-unga-jordbrukare/stod-till-unga-jordbrukare", "eligibility": "Jordbrukare under 41 år som bedriver jordbruksverksamhet"},
            {"title": "Kompensationsstöd", "path": "/stod/jordbruk-tradgard-och-rennaring/jordbruksmark/kompensationsstod", "eligibility": "Jordbrukare i områden med sämre förutsättningar"},
            {"title": "Miljöersättning för betesmarker", "path": "/stod/jordbruk-tradgard-och-rennaring/jordbruksmark/miljoersattning-for-betesmarker-och-slatterangar", "eligibility": "Jordbrukare med betesmarker eller slåtterängar"},
            {"title": "Ersättning för ekologisk produktion", "path": "/stod/jordbruk-tradgard-och-rennaring/jordbruksmark/ersattning-for-ekologisk-produktion", "eligibility": "Certifierade ekologiska jordbrukare"},
            {"title": "Djurvälfärdsersättning", "path": "/stod/jordbruk-tradgard-och-rennaring/djur/djurvalfardsersattning", "eligibility": "Lantbrukare med mjölkkor, köttkor eller suggor"},
            {"title": "Investeringsstöd för jordbruk", "path": "/stod/jordbruk-tradgard-och-rennaring/investeringsstod-for-jordbruk-tradgard-och-rennaring", "eligibility": "Jordbruks- och trädgårdsföretag"},
            {"title": "Leader-stöd", "path": "/stod/lokalt-ledd-utveckling-genom-leader", "eligibility": "Föreningar, företag, organisationer och myndigheter inom leaderområden"},
            {"title": "Stöd till fiske och vattenbruk", "path": "/stod/fiske-och-vattenbruk", "eligibility": "Fiskare och vattenbruksföretag"},
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
                'category': self._categorize(prog['title']),
            })
        return results

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        if not grant['target_group'] or grant['target_group'] == ['all']:
            grant['target_group'] = ['agriculture', 'rural', 'food']
        ag_keywords = ['jordbruk', 'landsbygd', 'livsmedel']
        for kw in ag_keywords:
            if kw not in grant['keywords']:
                grant['keywords'].append(kw)
        return grant


if __name__ == "__main__":
    scraper = JordbruksverketScraper()
    scraper.scrape()
