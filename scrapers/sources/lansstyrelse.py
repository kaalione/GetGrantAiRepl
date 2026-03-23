#!/usr/bin/env python3
"""
Scraper for all 21 Swedish County Administrative Boards (Länsstyrelser).
Each county has support pages under consistent URL patterns.
Scrapes support/grant listings from each county's website.
"""

import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class LansstyrelseScraper(BaseScraper):
    COUNTIES = [
        {"name": "Stockholm", "slug": "stockholm"},
        {"name": "Uppsala", "slug": "uppsala"},
        {"name": "Södermanland", "slug": "sodermanland"},
        {"name": "Östergötland", "slug": "ostergotland"},
        {"name": "Jönköping", "slug": "jonkoping"},
        {"name": "Kronoberg", "slug": "kronoberg"},
        {"name": "Kalmar", "slug": "kalmar"},
        {"name": "Gotland", "slug": "gotland"},
        {"name": "Blekinge", "slug": "blekinge"},
        {"name": "Skåne", "slug": "skane"},
        {"name": "Halland", "slug": "halland"},
        {"name": "Västra Götaland", "slug": "vastra-gotaland"},
        {"name": "Värmland", "slug": "varmland"},
        {"name": "Örebro", "slug": "orebro"},
        {"name": "Västmanland", "slug": "vastmanland"},
        {"name": "Dalarna", "slug": "dalarna"},
        {"name": "Gävleborg", "slug": "gavleborg"},
        {"name": "Västernorrland", "slug": "vasternorrland"},
        {"name": "Jämtland", "slug": "jamtland"},
        {"name": "Västerbotten", "slug": "vasterbotten"},
        {"name": "Norrbotten", "slug": "norrbotten"},
    ]

    SUPPORT_PATHS = [
        "natur-och-landsbygd/stod-till-jordbruk-och-landsbygd.html",
        "natur-och-landsbygd/stod-till-naturvard.html",
        "miljo-och-vatten/energi--och-klimatomstallning/klimatinvesteringsstod.html",
    ]

    def __init__(self, source_id=None):
        super().__init__(source_id=source_id)
        self.source_name = "Länsstyrelserna"
        self.base_url = "https://www.lansstyrelsen.se"
        self.organization = "Länsstyrelserna"
        self.default_category = "regional"

    def fetch_grants(self):
        all_grants = []

        for county in self.COUNTIES:
            print(f"  Scraping Länsstyrelsen {county['name']}...")
            county_grants = self._scrape_county(county)
            all_grants.extend(county_grants)
            print(f"    Found {len(county_grants)} items from {county['name']}")
            self.rate_limit(1)

        print(f"  Total raw items from all counties: {len(all_grants)}")
        return all_grants

    def _scrape_county(self, county):
        grants = []
        seen_urls = set()

        for path in self.SUPPORT_PATHS:
            url = f"{self.base_url}/{county['slug']}/{path}"
            try:
                soup = self.fetch_page(url)
                if not soup:
                    continue

                links = soup.select("main a[href], .sv-text-portlet-content a[href], article a[href]")
                for link in links:
                    href = link.get("href", "")
                    title = link.get_text(strip=True)

                    if not title or len(title) < 5 or len(title) > 200:
                        continue

                    skip_words = [
                        "kontakt", "om oss", "english", "press", "nyheter",
                        "logga in", "sök", "meny", "stäng", "cookie",
                        "lyssna", "skriv ut", "dela", "twitter", "facebook",
                        "läs mer om", "tillbaka", "readspeaker",
                    ]
                    if any(sw in title.lower() for sw in skip_words):
                        continue

                    if href.startswith("/"):
                        full_url = f"{self.base_url}{href}"
                    elif href.startswith("http"):
                        full_url = href
                    else:
                        continue

                    if "lansstyrelsen.se" not in full_url:
                        continue

                    if full_url in seen_urls:
                        continue

                    relevant_kw = [
                        "stod", "stöd", "bidrag", "finansiering", "ersättning",
                        "investering", "fond", "projekt", "klimat",
                    ]
                    if not any(kw in full_url.lower() or kw in title.lower() for kw in relevant_kw):
                        continue

                    if full_url.endswith(f"/{path}"):
                        continue

                    seen_urls.add(full_url)
                    raw = {
                        "title": title,
                        "url": full_url,
                        "description": "",
                        "deadline_text": "",
                        "status_text": "",
                        "amount_text": "",
                        "eligibility": "",
                        "county": county["name"],
                        "category": "regional",
                    }
                    self.rate_limit(1)
                    self._enrich_detail(raw)
                    grants.append(raw)

            except Exception as e:
                print(f"    Error on {path} for {county['name']}: {e}")

        return grants

    def _enrich_detail(self, raw):
        """Fetch detail page and extract eligibility, description, deadline, amount, and status information."""
        detail = self.fetch_page(raw['url'])
        if not detail:
            return

        # Extract description from first 5 paragraphs
        desc_elem = detail.select_one('article, main, .main-content, .content, .sv-text-portlet')
        if desc_elem:
            paragraphs = desc_elem.find_all('p')
            raw['description'] = ' '.join(p.get_text(strip=True) for p in paragraphs[:5])

        page_text = detail.get_text(' ', strip=True)
        page_lower = page_text.lower()

        # Extract deadline with Swedish month names
        date_match = re.search(
            r'(?:sista|stänger|ansök\s*senast)[:\s]*(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
            page_text, re.IGNORECASE
        )
        if date_match:
            raw['deadline_text'] = date_match.group(1)

        # Extract amount information
        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK)[^.]*)', page_text, re.IGNORECASE)
        if amount_match:
            raw['amount_text'] = amount_match.group(1)

        # Determine status
        if any(w in page_lower for w in ['löpande', 'kan sökas löpande', 'ansökan är öppen', 'ansök nu', 'gör din ansökan', 'öppen']):
            raw['status_text'] = 'öppen'
        elif any(w in page_lower for w in ['inte möjligt att söka', 'stängd', 'avslutad', 'kan inte sökas', 'inga nya ansökningar']):
            raw['status_text'] = 'stängd'

        # Extract eligibility information
        county = raw.get('county', '')
        eligibility_parts = []

        # Scan h2/h3/h4 headings for eligibility keywords
        for heading in detail.select('h2, h3, h4'):
            h_text = heading.get_text(strip=True).lower()
            if any(w in h_text for w in ['vem kan söka', 'vem kan få', 'vilka kan söka', 'vem riktar sig', 'målgrupp', 'villkor', 'krav', 'vem gäller', 'förutsättning']):
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
            fallback_patterns = [
                r'(?:vem\s+kan\s+(?:söka|få)|vilka\s+kan\s+söka|riktar\s+sig\s+till)[:\s]*([^.]+\.(?:[^.]+\.)?)',
                r'(?:du\s+kan\s+(?:söka|få)\s+stöd[^.]*\.(?:[^.]+\.)?)',
                r'(?:ni\s+som\s+kan\s+söka[^.]*\.(?:[^.]+\.)?)',
                r'(?:stödet\s+(?:riktar\s+sig|gäller|kan\s+sökas)[^.]*\.(?:[^.]+\.)?)',
                r'(?:kan\s+sökas\s+av[^.]*\.(?:[^.]+\.)?)',
            ]
            for pat in fallback_patterns:
                elig_match = re.search(pat, page_text, re.IGNORECASE)
                if elig_match:
                    eligibility_parts.append(elig_match.group(0).strip())
                    break

        # Combine eligibility parts and include county context
        if eligibility_parts:
            eligibility_text = ' '.join(eligibility_parts)
            if county:
                raw['eligibility'] = f"{county}: {eligibility_text}"
            else:
                raw['eligibility'] = eligibility_text

    def transform_to_grant(self, raw):
        grant = super().transform_to_grant(raw)

        county = raw.get("county", "")
        grant["source_name"] = "Länsstyrelserna"
        grant["organization"] = f"Länsstyrelsen {county}" if county else "Länsstyrelserna"
        grant["category"] = "regional"

        existing_kw = grant.get("keywords", []) or []
        county_kw = [county.lower(), "regional", "länsstyrelsen"] if county else ["regional", "länsstyrelsen"]
        grant["keywords"] = list(set(existing_kw + county_kw))

        return grant


if __name__ == "__main__":
    scraper = LansstyrelseScraper()
    scraper.scrape()
