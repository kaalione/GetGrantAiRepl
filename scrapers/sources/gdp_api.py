#!/usr/bin/env python3
"""
Gemensamma data-projektet (GDP) — the shared open-data standard used by
Vinnova, Formas, Forte and Vetenskapsrådet.

One class serves all four, because that is the point of the standard: the same
fields from every agency. An agency is a database row:

    { "kind": "gdp_api",
      "base": "https://api.formas.se/gdp_formas",
      "key_env": "GDP_FORMAS_KEY",
      "funder": "Formas" }

This replaces HTML scraping for these agencies. The data is CC0, refreshed
daily, and carries the fields the scrapers had to guess at: real closing dates,
status, and the public page URL.

Authentication is a query parameter — `authorization=<key>` — not the
Ocp-Apim-Subscription-Key header the Azure gateway implies. The header is
rejected with 401; verified against the live API.
"""

import os
import sys
from typing import Any, Dict, List

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper

# The standard's status values, mapped to ours.
STATUS_MAP = {
    "Pågående": "open",
    "Kommande": "upcoming",
    "Avslutad": "closed",
}


class GdpApiScraper(BaseScraper):
    def __init__(self, source: Dict[str, Any]):
        super().__init__(source.get("id"))
        config = source.get("selectors") or {}
        self.base = (config.get("base") or source["url"]).rstrip("/")
        self.key_env = config.get("key_env") or ""
        self.funder = config.get("funder") or source["name"]
        self.base_url = f"{self.base}/utlysningar"
        self.source_name = source["name"]
        self.organization = self.funder
        self.default_category = config.get("category") or "forskning"

    def _key(self) -> str:
        key = os.environ.get(self.key_env, "").strip()
        if not key:
            raise RuntimeError(
                f"{self.key_env} is not set — create a key at gdphub.se and add it "
                f"to the environment. Without it this agency cannot be read."
            )
        return key

    def fetch_grants(self) -> List[Dict[str, Any]]:
        # Asking for a page limit returns records with the dates and status
        # stripped out, so the whole list is fetched at once. It is a few
        # hundred records per agency, refreshed once a day.
        response = requests.get(
            self.base_url,
            params={"authorization": self._key()},
            timeout=90,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        calls = response.json()
        print(f"  {len(calls)} calls from {self.funder}")

        grants = []
        for call in calls:
            url = self._public_url(call)
            if not url:
                # Without a page to send an applicant to, the row is not usable.
                continue

            status = STATUS_MAP.get(call.get("status") or "", "")
            deadline = call.get("stangningsdatum") or ""

            grants.append({
                "title": call.get("titel") or call.get("titelEng") or "",
                "url": url,
                "description": call.get("beskrivning") or call.get("beskrivningEng") or "",
                "eligibility": "",
                "amount_text": self._amount_text(call),
                "status_text": status,
                "deadline_text": deadline,
                "category": self.default_category,
                # Grant forms are the closest thing the standard has to a topic.
                "keywords_text": ", ".join(
                    f.get("namn", "") for f in (call.get("bidragsformer") or []) if f.get("namn")
                ),
            })

        return grants

    @staticmethod
    def _public_url(call: Dict[str, Any]) -> str:
        """The agency's own page for the call. `lank` points at the API, not the web."""
        for place in call.get("publiceringsplatser") or []:
            address = (place or {}).get("webbadress")
            if address:
                return address
        return ""

    @staticmethod
    def _amount_text(call: Dict[str, Any]) -> str:
        amount = call.get("budgetBelopp")
        if not amount:
            return ""
        currency = call.get("budgetValuta") or "SEK"
        return f"{amount} {currency}"
