import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from bs4 import BeautifulSoup
import requests

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import upsert_grant


class GenericScraper:
    """A generic scraper that can use Playwright or BeautifulSoup based on source config."""
    
    def __init__(self, source: Dict[str, Any]):
        self.source = source
        self.source_id = source['id']
        self.url = source['url']
        self.name = source['name']
        self.scraper_type = source.get('scraper_type', 'beautifulsoup')
        self.selectors = source.get('selectors') or {}
        
    def scrape(self) -> int:
        """Execute the scraper and return the number of grants found.
        
        Note: Log entries are managed by the Node.js API that triggers this scraper.
        The scraper only upserts grants and prints output for the API to parse.
        """
        if self.source['type'] == 'api':
            grants = self.scrape_api()
        elif self.scraper_type == 'playwright':
            grants = self.scrape_with_playwright()
        else:
            grants = self.scrape_with_beautifulsoup()
        
        for grant in grants:
            upsert_grant(grant)
        
        print(f"[{self.name}] Successfully scraped {len(grants)} grants found")
        return len(grants)
    
    def scrape_with_playwright(self) -> List[Dict[str, Any]]:
        """Scrape using Playwright for JavaScript-rendered pages."""
        if not PLAYWRIGHT_AVAILABLE:
            raise ImportError("Playwright is not installed. Install with: pip install playwright && playwright install")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            try:
                page.goto(self.url, wait_until='networkidle', timeout=30000)
                
                if self.selectors.get('wait_selector'):
                    page.wait_for_selector(self.selectors['wait_selector'], timeout=10000)
                
                html = page.content()
                grants = self.extract_grants(html)
                
            finally:
                browser.close()
            
            return grants
    
    def scrape_with_beautifulsoup(self) -> List[Dict[str, Any]]:
        """Scrape using BeautifulSoup for static HTML pages."""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(self.url, headers=headers, timeout=30)
        response.raise_for_status()
        
        return self.extract_grants(response.text)
    
    def scrape_api(self) -> List[Dict[str, Any]]:
        """Scrape from an API endpoint."""
        api_config = self.source.get('api_config') or {}
        headers = api_config.get('headers', {})
        
        if api_config.get('api_key'):
            headers['Authorization'] = f"Bearer {api_config['api_key']}"
        
        response = requests.get(self.url, headers=headers, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        return self.transform_api_response(data)
    
    def extract_grants(self, html: str) -> List[Dict[str, Any]]:
        """Extract grant data from HTML using configured selectors."""
        soup = BeautifulSoup(html, 'lxml')
        grants = []
        
        container_selector = self.selectors.get('container', 'article')
        items = soup.select(container_selector)
        
        if not items:
            items = [soup]
        
        for item in items:
            grant = self.extract_grant_from_element(item)
            if grant and grant.get('title'):
                grants.append(grant)
        
        return grants
    
    def extract_grant_from_element(self, element) -> Optional[Dict[str, Any]]:
        """Extract a single grant from an HTML element."""
        title = self._extract_text(element, self.selectors.get('title', 'h2, h3, .title'))
        if not title:
            return None
            
        description = self._extract_text(element, self.selectors.get('description', 'p, .description'))
        url = self._extract_href(element, self.selectors.get('link', 'a'))
        deadline_text = self._extract_text(element, self.selectors.get('deadline', '.deadline, .date'))
        amount_text = self._extract_text(element, self.selectors.get('amount', '.amount, .belopp'))
        
        grant = {
            'title': title,
            'description': description or '',
            'source_name': self.name,
            'source_type': self._guess_source_type(),
            'url': url or self.url,
            'deadline': self._parse_date(deadline_text) if deadline_text else None,
            'amount_min': self._parse_amount(amount_text, 'min'),
            'amount_max': self._parse_amount(amount_text, 'max'),
            'eligibility_criteria': None,
            'target_group': [],
            'keywords': [],
            'application_requirements': None,
            'status': 'open',
            'raw_data': {'scraped_at': datetime.now().isoformat()}
        }
        
        return grant
    
    def transform_api_response(self, data: Any) -> List[Dict[str, Any]]:
        """Transform API response to grant schema. Override in subclasses."""
        grants = []
        
        items = data if isinstance(data, list) else data.get('items', data.get('results', []))
        
        for item in items:
            grant = {
                'title': item.get('title') or item.get('name') or item.get('rubrik', ''),
                'description': item.get('description') or item.get('beskrivning', ''),
                'source_name': self.name,
                'source_type': self._guess_source_type(),
                'url': item.get('url') or item.get('link', self.url),
                'deadline': self._parse_date(item.get('deadline') or item.get('slutdatum')),
                'amount_min': item.get('amount_min') or item.get('minBelopp'),
                'amount_max': item.get('amount_max') or item.get('maxBelopp'),
                'eligibility_criteria': item.get('eligibility_criteria') or item.get('behorighetskriterier'),
                'target_group': item.get('target_group') or item.get('malgrupper', []),
                'keywords': item.get('keywords') or item.get('nyckelord', []),
                'application_requirements': item.get('application_requirements') or item.get('ansokanskrav'),
                'status': item.get('status', 'open'),
                'raw_data': item
            }
            if grant['title']:
                grants.append(grant)
        
        return grants
    
    def _extract_text(self, element, selector: str) -> Optional[str]:
        """Extract text from an element using a selector."""
        found = element.select_one(selector)
        return found.get_text(strip=True) if found else None
    
    def _extract_href(self, element, selector: str) -> Optional[str]:
        """Extract href attribute from a link element."""
        found = element.select_one(selector)
        if found and found.has_attr('href'):
            href = found['href']
            if href.startswith('/'):
                from urllib.parse import urljoin
                return urljoin(self.url, href)
            return href
        return None
    
    def _guess_source_type(self) -> str:
        """Guess the source type based on the URL or name."""
        name_lower = self.name.lower()
        url_lower = self.url.lower()
        
        if 'eu' in name_lower or 'europa' in url_lower or 'horizon' in name_lower:
            return 'eu'
        elif 'stiftelse' in name_lower:
            return 'stiftelse'
        else:
            return 'myndighet'
    
    def _parse_date(self, date_text: Optional[str]) -> Optional[datetime]:
        """Parse a date string into a datetime object."""
        if not date_text:
            return None
        
        formats = [
            '%Y-%m-%d',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%dT%H:%M:%SZ',
            '%d/%m/%Y',
            '%d-%m-%Y',
            '%d %B %Y',
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_text.strip(), fmt)
            except ValueError:
                continue
        
        return None
    
    def _parse_amount(self, amount_text: Optional[str], type: str = 'min') -> Optional[str]:
        """Parse amount from text. Returns min or max amount."""
        if not amount_text:
            return None
        
        import re
        numbers = re.findall(r'[\d\s]+', amount_text.replace(' ', ''))
        numbers = [n.strip() for n in numbers if n.strip()]
        
        if not numbers:
            return None
        
        try:
            if len(numbers) >= 2:
                return numbers[0] if type == 'min' else numbers[1]
            return numbers[0]
        except (IndexError, ValueError):
            return None
