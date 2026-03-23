#!/usr/bin/env python3
"""
Scraper for Eufonder.se — Swedish-language EU funding aggregator.
Provides EU fund program info in Swedish. Scrapes fund category pages
and any linked call/support pages.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class EuFonderScraper(BaseScraper):
    FUND_PAGES = [
        {
            "name": "Regionalfonden",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/regionalfonden.6395.html",
            "category": "regional",
        },
        {
            "name": "Socialfonden",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/socialfonden.6393.html",
            "category": "social",
        },
        {
            "name": "Jordbruksfonden för landsbygdsutveckling",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/jordbruksfondenforlandsbygdsutveckling.6394.html",
            "category": "agriculture",
        },
        {
            "name": "Havs-, fiskeri- och vattenbruksfonden",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/havsfiskeriochvattenbruksfonden.6397.html",
            "category": "environment",
        },
        {
            "name": "Fonden för en rättvis omställning",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/fondenforenrattvisomstallning.6392.html",
            "category": "energy",
        },
        {
            "name": "Asyl-, migrations- och integrationsfonden",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/asylmigrationsochintegrationsfonden.6401.html",
            "category": "social",
        },
        {
            "name": "Fonden för inre säkerhet",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/fondenforinresakerhet.6399.html",
            "category": "security",
        },
    ]

    TOPIC_PAGES = [
        {
            "name": "Kompetens och entreprenörskap",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/kompetensentreprenorskap.6375.html",
        },
        {
            "name": "Forskning och innovation",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/forskninginnovation.6387.html",
        },
        {
            "name": "Miljö och klimat",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/miljoklimat.6420.html",
        },
        {
            "name": "Digitalisering",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/digitalisering.6423.html",
        },
        {
            "name": "Industri",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/industri.6424.html",
        },
        {
            "name": "Social inkludering",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/socialinkludering.6422.html",
        },
        {
            "name": "Samarbete mellan länder",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/samarbetemellanlander.6417.html",
        },
        {
            "name": "Landsbygd, fiske och vattenbruk",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/landsbygdhavfiskeochvattenbruk.6418.html",
        },
        {
            "name": "Transport och resande",
            "url": "https://eufonder.se/eufonder/hittaeufinansiering/omraden/transportresande.6425.html",
        },
    ]

    def __init__(self, source_id=None):
        super().__init__(source_id=source_id)
        self.source_name = "Eufonder.se"
        self.base_url = "https://eufonder.se"
        self.organization = "Eufonder.se"
        self.default_category = "eu"

    def fetch_grants(self):
        all_grants = []
        seen_urls = set()

        for fund in self.FUND_PAGES:
            print(f"  Scraping fund: {fund['name']}...")
            try:
                soup = self.fetch_page(fund["url"])
                if not soup:
                    continue

                grants = self._extract_links(soup, fund["name"], fund.get("category", "eu"))
                for g in grants:
                    if g["url"] not in seen_urls:
                        seen_urls.add(g["url"])
                        all_grants.append(g)

                main = soup.select_one("main, article, .main-content, .sv-text-portlet-content")
                if main:
                    text = main.get_text(separator=" ", strip=True)[:3000]
                    if len(text) > 100:
                        all_grants.append({
                            "title": fund["name"],
                            "url": fund["url"],
                            "description": text,
                            "deadline_text": "",
                            "status_text": "open",
                            "amount_text": "",
                            "eligibility": "",
                            "category": fund.get("category", "eu"),
                        })
                        seen_urls.add(fund["url"])

            except Exception as e:
                print(f"    Error scraping {fund['name']}: {e}")

            self.rate_limit()

        for topic in self.TOPIC_PAGES:
            print(f"  Scraping topic: {topic['name']}...")
            try:
                soup = self.fetch_page(topic["url"])
                if not soup:
                    continue

                grants = self._extract_links(soup, topic["name"], "eu")
                for g in grants:
                    if g["url"] not in seen_urls:
                        seen_urls.add(g["url"])
                        all_grants.append(g)

            except Exception as e:
                print(f"    Error scraping {topic['name']}: {e}")

            self.rate_limit()

        print(f"  Total items found: {len(all_grants)}")
        return all_grants

    def _extract_links(self, soup, context_name, category):
        grants = []
        links = soup.select("main a[href], article a[href], .sv-text-portlet-content a[href]")

        for link in links:
            href = link.get("href", "")
            title = link.get_text(strip=True)

            if not title or len(title) < 10 or len(title) > 200:
                continue

            skip_words = [
                "startsida", "kontakt", "om oss", "webbkarta", "cookie",
                "personuppgifter", "tillgänglighet", "nyheter", "eufonder.se",
                "hitta eu-finansiering", "så här går det till",
                "finansierade projekt", "så kan du guida",
                "våra fonder", "därför finns",
            ]
            if any(sw in title.lower() for sw in skip_words):
                continue

            if href.startswith("/"):
                full_url = f"{self.base_url}{href}"
            elif href.startswith("http"):
                full_url = href
            else:
                continue

            relevant_kw = [
                "utlys", "stod", "stöd", "bidrag", "finansi", "ansök",
                "fond", "program", "tillvaxtverket", "vinnova",
                "jordbruksverket", "formas", "energi",
            ]
            if not any(kw in full_url.lower() or kw in title.lower() for kw in relevant_kw):
                continue

            grants.append({
                "title": title,
                "url": full_url,
                "description": f"Från EU-fonden/programmet: {context_name}",
                "deadline_text": "",
                "status_text": "open",
                "amount_text": "",
                "eligibility": "",
                "category": category,
            })

        return grants

    def transform_to_grant(self, raw):
        grant = super().transform_to_grant(raw)
        grant["source_name"] = "Eufonder.se"
        grant["organization"] = "EU (via Eufonder.se)"
        grant["category"] = raw.get("category", "eu")

        existing_kw = grant.get("keywords", []) or []
        grant["keywords"] = list(set(existing_kw + ["eu", "europeisk"]))

        return grant


if __name__ == "__main__":
    scraper = EuFonderScraper()
    scraper.scrape()
