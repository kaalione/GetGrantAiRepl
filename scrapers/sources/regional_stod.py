#!/usr/bin/env python3
"""
Config-driven scraper for Swedish regional business support.

The 21 regions each publish their own stød pages with no shared structure, but
the content is the same shape everywhere: a listing page linking to a handful of
standing support types (investeringsstöd, innovationsbidrag, tillväxtcheck,
konsultcheckar) that are open continuously and applied for through
Tillväxtverket's "Min ansökan".

Because the shape is common and only the markup differs, a region is a database
row rather than a Python file — the listing URL and a couple of selectors live
in scraper_sources.selectors:

    {
      "kind": "regional_stod",
      "link_selector": "main a",          optional, defaults to "main a, article a"
      "link_pattern": "/foretagsstod/",   substring a link must contain
      "region": "Västerbotten"            used for eligibility text
    }

Standing support has no deadline. That is represented honestly as a null
deadline rather than an invented one; the grants schema already allows it and
the status logic treats such rows as open.
"""

import os
import re
import sys
from urllib.parse import urljoin, urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper

# Links that look like navigation rather than a support type.
SKIP_PATTERNS = re.compile(
    r"(kontakt|nyhet|press|om-oss|cookie|integritet|sitemap|sok|search|"
    r"logga|english|/en/|facebook|linkedin|twitter|instagram|youtube)",
    re.IGNORECASE,
)

# Material icon ligatures are rendered as text and get picked up by
# get_text(), so they arrive glued to the link label.
ICON_WORDS = re.compile(
    r"\b(arrow_forward|arrow_back|chevron_right|open_in_new|expand_more|launch)\b",
    re.IGNORECASE,
)

# A support page says what it gives money for; a landing page rarely does.
SUPPORT_WORDS = re.compile(
    r"(stöd|bidrag|check|finansiering|investering|innovation|utveckling)",
    re.IGNORECASE,
)


class RegionalStodScraper(BaseScraper):
    def __init__(self, source):
        super().__init__(source.get("id"))
        config = source.get("selectors") or {}
        self.base_url = source["url"]
        self.source_name = source["name"]
        self.organization = source["name"]
        self.default_category = "regional"
        self.link_selector = config.get("link_selector") or "main a, article a"
        self.link_pattern = config.get("link_pattern") or ""
        self.region = config.get("region") or source["name"]
        self.max_pages = int(config.get("max_pages") or 25)
        # Optional: only keep pages whose text mentions one of these. Regions
        # that mix business support with culture and health grants need it.
        # Several regions render their support listing client-side, so the
        # static HTML holds only site navigation.
        self.render = bool(config.get("render"))
        require = config.get("require_words") or []
        self.require_words = re.compile("|".join(require), re.IGNORECASE) if require else None

    def _candidate_links(self, soup):
        """Links on the listing page that plausibly describe a support type."""
        host = urlparse(self.base_url).netloc
        seen = set()
        out = []

        for a in soup.select(self.link_selector):
            href = a.get("href")
            text = ICON_WORDS.sub("", a.get_text(" ", strip=True)).strip()
            if not href or not text or len(text) < 8:
                continue

            url = urljoin(self.base_url, href).split("#")[0].rstrip("/")
            if urlparse(url).netloc != host or url in seen:
                continue
            if url.rstrip("/") == self.base_url.rstrip("/"):
                continue
            if SKIP_PATTERNS.search(url) or SKIP_PATTERNS.search(text):
                continue
            if self.link_pattern and self.link_pattern not in url:
                continue
            if not SUPPORT_WORDS.search(text) and not SUPPORT_WORDS.search(url):
                continue

            seen.add(url)
            out.append({"title": text, "url": url})

        return out[: self.max_pages]

    def _load(self, url):
        if self.render:
            return self.fetch_page_playwright(url)
        return self.fetch_page(url)

    def _listing_title(self, soup):
        heading = soup.select_one("h1")
        text = heading.get_text(" ", strip=True) if heading else ""
        return text or f"Företagsstöd i {self.region}"

    def fetch_grants(self):
        listing = self._load(self.base_url)
        if not listing:
            print(f"  Could not load listing page: {self.base_url}")
            return []

        links = self._candidate_links(listing)
        print(f"  {len(links)} candidate support pages")

        # Some regions describe every support type on the listing page itself
        # rather than linking out. Treating that page as one grant is more
        # honest than reporting the region as having nothing.
        if not links:
            print("  no sub-pages found — treating the listing itself as one support page")
            links = [{"title": self._listing_title(listing), "url": self.base_url}]

        grants = []
        for link in links:
            self.rate_limit()
            detail = self._load(link["url"])
            if not detail:
                continue

            body = detail.select_one("main, article, .content, #content") or detail
            paragraphs = [p.get_text(" ", strip=True) for p in body.find_all("p")]
            description = " ".join(p for p in paragraphs if len(p) > 40)[:2000]

            # A page with nothing to say about the support is a nav page.
            if len(description) < 120:
                continue

            if self.require_words and not self.require_words.search(f"{link['title']} {description}"):
                continue

            text = body.get_text(" ", strip=True)
            amount = re.search(
                r"(\d[\d\s.,]*(?:\s*(?:miljon(?:er)?|tusen))?\s*(?:kronor|kr|SEK))",
                text, re.IGNORECASE,
            )
            deadline = re.search(
                r"(\d{1,2}\s+(?:januari|februari|mars|april|maj|juni|juli|augusti|"
                r"september|oktober|november|december)\s+\d{4})",
                text, re.IGNORECASE,
            )

            grants.append({
                "title": link["title"],
                "url": link["url"],
                "description": description,
                "eligibility": f"Företag i {self.region}",
                "amount_text": amount.group(1) if amount else "",
                # Standing support: open until the region says otherwise.
                "status_text": "open",
                "deadline_text": deadline.group(1) if deadline else "",
                "category": self.default_category,
            })

        return grants
