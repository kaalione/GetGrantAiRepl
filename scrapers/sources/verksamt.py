#!/usr/bin/env python3
"""
Scraper for Verksamt.se — Sweden's official business support aggregator.
Uses the promotor-service API to fetch financing listings.

IMPORTANT: This source aggregates grants from many agencies we already
scrape individually (Vinnova, Tillväxtverket, Almi, etc.).
Deduplication via URL matching handles overlap automatically.
"""

import sys
import os
import re
import requests
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper


class VerksamtScraper(BaseScraper):
    API_URL = "https://verksamt.se/api/tillvaxtverket/promotor-service/record/findByTaggroupsAndTypes"
    COUNT_URL = "https://verksamt.se/api/tillvaxtverket/promotor-service/record/countByTaggroupsAndTypes"

    def __init__(self, source_id=None):
        super().__init__(source_id=source_id)
        self.source_name = "Verksamt.se"
        self.market = 'se'
        self.national = True  # nationell myndighet/program — öppet i hela landet
        self.base_url = "https://verksamt.se/finansiering-radgivning/hitta-radgivning-och-finansiering"
        self.organization = "Verksamt.se"
        self.default_category = "general"

    def fetch_grants(self):
        grants = []
        params = {
            "limit": 100,
            "offset": 0,
            "order": "relevance",
            "type": "FINANCING",
            "taggroup": "form.hitta-radgivare",
        }

        try:
            count_resp = requests.get(self.COUNT_URL, params=params, headers=self.headers, timeout=30)
            count_resp.raise_for_status()
            total = int(count_resp.text.strip())
            print(f"  Verksamt.se API reports {total} financing items")
        except Exception as e:
            print(f"  Could not get count: {e}")
            total = 100

        offset = 0
        page_size = 50
        while offset < total:
            params["limit"] = page_size
            params["offset"] = offset
            try:
                resp = requests.get(self.API_URL, params=params, headers=self.headers, timeout=30)
                resp.raise_for_status()
                items = resp.json()
                if not items:
                    break

                for item in items:
                    raw = self._parse_item(item)
                    if raw:
                        grants.append(raw)

                offset += page_size
                if offset < total:
                    self.rate_limit()
            except Exception as e:
                print(f"  API error at offset {offset}: {e}")
                break

        print(f"  Fetched {len(grants)} financing items from API")
        return grants

    def _parse_item(self, item):
        name = item.get("name", "").strip()
        if not name or len(name) < 5:
            return None

        contact = item.get("contact", {}) or {}
        website = contact.get("website", "")
        if not website:
            return None

        desc_lang = item.get("descriptionLang", {}) or {}
        desc_text = desc_lang.get("text", "")
        desc_text = re.sub(r'^\(sv\):\s*', '', desc_text)
        desc_text = re.sub(r'<[^>]+>', ' ', desc_text)
        desc_text = re.sub(r'\s+', ' ', desc_text).strip()

        org_data = item.get("organisation", {}) or {}
        org_name = org_data.get("externalName", "")

        location_lang = item.get("locationLang", {}) or {}
        location = location_lang.get("text", "")
        location = re.sub(r'^\(sv\):\s*', '', location).strip()

        event_data = item.get("event", {}) or {}
        end_date = event_data.get("endDate", "")
        deadline_text = ""
        if end_date:
            deadline_text = end_date.split("T")[0] if "T" in end_date else end_date

        eligibility = ""
        amount_text = ""
        desc_lower = desc_text.lower()

        elig_patterns = [
            r'(?:vem\s+kan\s+(?:söka|få)|vilka\s+kan\s+söka|riktar\s+sig\s+till|målgrupp)[:\s]*([^.]+\.(?:[^.]+\.)?)',
            r'(?:krav|villkor|förutsättning)[:\s]*([^.]+\.)',
        ]
        for pat in elig_patterns:
            m = re.search(pat, desc_text, re.IGNORECASE)
            if m:
                eligibility = m.group(1).strip()
                break

        if not eligibility:
            target_lang = item.get("targetGroupLang", {}) or {}
            target_text = target_lang.get("text", "")
            if target_text:
                target_text = re.sub(r'^\(sv\):\s*', '', target_text).strip()
                target_text = re.sub(r'<[^>]+>', ' ', target_text)
                target_text = re.sub(r'\s+', ' ', target_text).strip()
                if target_text:
                    eligibility = target_text

        amount_match = re.search(r'(\d+(?:[.,]\d+)?\s*(?:miljon(?:er)?|kronor|kr|SEK|MSEK|EUR)[^.]*)', desc_text, re.IGNORECASE)
        if amount_match:
            amount_text = amount_match.group(1)

        return {
            "title": name,
            "url": website,
            "description": desc_text[:3000],
            "deadline_text": deadline_text,
            "status_text": "",
            "amount_text": amount_text,
            "eligibility": eligibility,
            "organisation": org_name,
            "location": location,
        }

    def transform_to_grant(self, raw):
        grant = super().transform_to_grant(raw)
        grant["source_name"] = "Verksamt.se"

        org = raw.get("organisation", "")
        if org:
            grant["organization"] = org

        location = raw.get("location", "")
        if location:
            existing_kw = grant.get("keywords", []) or []
            grant["keywords"] = list(set(existing_kw + [location.lower()]))

        return grant


if __name__ == "__main__":
    scraper = VerksamtScraper()
    scraper.scrape()
