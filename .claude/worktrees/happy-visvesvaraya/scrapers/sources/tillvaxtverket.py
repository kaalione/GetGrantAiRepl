import sys
import os
from typing import List, Dict, Any
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import upsert_grant
from sources.generic_scraper import GenericScraper


class TillvaxtverketScraper(GenericScraper):
    """Scraper specifically for Tillväxtverket grants."""
    
    BASE_URL = "https://tillvaxtverket.se"
    GRANTS_URL = "https://tillvaxtverket.se/tillvaxtverket/sokfinansiering/utlysningar.1139.html"
    
    def __init__(self, source: Dict[str, Any]):
        super().__init__(source)
    
    def scrape(self) -> int:
        """Scrape Tillväxtverket grants.
        
        Note: Log entries are managed by the Node.js API that triggers this scraper.
        """
        grants = self.scrape_main_grants_page()
        
        for grant in grants:
            upsert_grant(grant)
        
        print(f"[Tillväxtverket] Successfully scraped {len(grants)} grants found")
        return len(grants)
    
    def scrape_main_grants_page(self) -> List[Dict[str, Any]]:
        """Scrape the main Tillväxtverket grants page."""
        grants = []
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8'
            }
            
            response = requests.get(self.GRANTS_URL, headers=headers, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            grant_links = soup.select('a[href*="/utlysningar/utlysningar/"]')
            
            for link in grant_links:
                try:
                    grant_url = link.get('href', '')
                    if not grant_url.startswith('http'):
                        grant_url = self.BASE_URL + grant_url
                    
                    title = link.get_text(strip=True)
                    if not title or len(title) < 10:
                        continue
                    
                    grant_data = self.fetch_grant_details(grant_url, title)
                    if grant_data:
                        grants.append(grant_data)
                        
                except Exception as e:
                    print(f"[Tillväxtverket] Error processing grant link: {e}")
                    continue
            
            if not grants:
                grants = self.scrape_grant_cards(soup)
                    
        except Exception as e:
            print(f"[Tillväxtverket] Error scraping main page: {e}")
        
        return grants
    
    def fetch_grant_details(self, url: str, title: str) -> Dict[str, Any] | None:
        """Fetch detailed grant information from individual grant page."""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
            
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            full_title = title
            h1 = soup.find('h1')
            if h1:
                full_title = h1.get_text(strip=True)
            
            description = ""
            for selector in ['.preamble', '.ingress', '.intro', 'article p:first-of-type', 'main p:first-of-type']:
                elem = soup.select_one(selector)
                if elem:
                    description = elem.get_text(strip=True)
                    break
            
            if not description:
                paragraphs = soup.select('article p, main p, .content p')
                descriptions = []
                for p in paragraphs[:3]:
                    text = p.get_text(strip=True)
                    if text and len(text) > 50:
                        descriptions.append(text)
                description = ' '.join(descriptions)
            
            deadline = self.extract_deadline(soup)
            
            amount_min, amount_max = self.extract_amounts(soup)
            
            target_groups = self.extract_target_groups(soup, description)
            
            keywords = self.extract_keywords(soup, full_title, description)
            
            return {
                'title': full_title[:500],
                'description': description[:5000] if description else f"Utlysning från Tillväxtverket: {full_title}",
                'source_name': 'Tillväxtverket',
                'source_type': 'myndighet',
                'url': url,
                'deadline': deadline,
                'amount_min': amount_min,
                'amount_max': amount_max,
                'eligibility_criteria': {},
                'target_group': target_groups,
                'keywords': keywords,
                'application_requirements': {},
                'status': 'open' if not deadline or deadline > datetime.now() else 'closed',
                'raw_data': {'scraped_from': url, 'scraped_at': datetime.now().isoformat()}
            }
            
        except Exception as e:
            print(f"[Tillväxtverket] Error fetching grant details from {url}: {e}")
            return None
    
    def scrape_grant_cards(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Fallback: Extract grants from card-style listings."""
        grants = []
        
        card_selectors = ['.card', '.utlysning', '.grant-item', 'article', '.listing-item']
        
        for selector in card_selectors:
            cards = soup.select(selector)
            for card in cards:
                title_elem = card.select_one('h2, h3, h4, .title, .heading')
                if not title_elem:
                    continue
                    
                title = title_elem.get_text(strip=True)
                if not title or len(title) < 10:
                    continue
                
                link_elem = card.select_one('a[href]')
                url = link_elem.get('href', '') if link_elem else ''
                if url and not url.startswith('http'):
                    url = self.BASE_URL + url
                
                desc_elem = card.select_one('p, .description, .text')
                description = desc_elem.get_text(strip=True) if desc_elem else ""
                
                grants.append({
                    'title': title[:500],
                    'description': description[:5000] if description else f"Utlysning från Tillväxtverket: {title}",
                    'source_name': 'Tillväxtverket',
                    'source_type': 'myndighet',
                    'url': url or self.GRANTS_URL,
                    'deadline': None,
                    'amount_min': None,
                    'amount_max': None,
                    'eligibility_criteria': {},
                    'target_group': ['sme'],
                    'keywords': ['tillväxt', 'finansiering', 'EU-stöd'],
                    'application_requirements': {},
                    'status': 'open',
                    'raw_data': {'scraped_at': datetime.now().isoformat()}
                })
        
        return grants
    
    def extract_deadline(self, soup: BeautifulSoup) -> datetime | None:
        """Extract deadline from page content."""
        deadline_patterns = [
            r'sista.{0,20}ansökningsdag[:\s]+(\d{1,2})\s*(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s*(\d{4})',
            r'stänger[:\s]+(\d{1,2})\s*(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s*(\d{4})',
            r'(\d{4})-(\d{2})-(\d{2})',
            r'(\d{1,2})/(\d{1,2})/(\d{4})'
        ]
        
        month_map = {
            'januari': 1, 'februari': 2, 'mars': 3, 'april': 4,
            'maj': 5, 'juni': 6, 'juli': 7, 'augusti': 8,
            'september': 9, 'oktober': 10, 'november': 11, 'december': 12
        }
        
        page_text = soup.get_text()
        
        for pattern in deadline_patterns[:2]:
            match = re.search(pattern, page_text, re.IGNORECASE)
            if match:
                try:
                    day = int(match.group(1))
                    month = month_map.get(match.group(2).lower(), 1)
                    year = int(match.group(3))
                    return datetime(year, month, day)
                except:
                    continue
        
        for pattern in deadline_patterns[2:]:
            match = re.search(pattern, page_text)
            if match:
                try:
                    if '-' in pattern:
                        year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
                    else:
                        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
                    return datetime(year, month, day)
                except:
                    continue
        
        return None
    
    def extract_amounts(self, soup: BeautifulSoup) -> tuple:
        """Extract funding amounts from page content."""
        page_text = soup.get_text()
        
        amount_patterns = [
            r'(\d+(?:[\s,]\d+)*)\s*(?:miljoner?\s*(?:kronor|kr|SEK))',
            r'(?:max|upp\s*till)\s*(\d+(?:[\s,]\d+)*)\s*(?:kronor|kr|SEK)',
            r'(\d+(?:[\s,]\d+)*)\s*MSEK',
        ]
        
        amounts = []
        for pattern in amount_patterns:
            matches = re.findall(pattern, page_text, re.IGNORECASE)
            for match in matches:
                try:
                    num_str = re.sub(r'[\s,]', '', match)
                    amount = float(num_str)
                    if 'miljon' in pattern.lower() or 'MSEK' in pattern:
                        amount *= 1_000_000
                    amounts.append(amount)
                except:
                    continue
        
        if amounts:
            return (str(min(amounts)) if len(amounts) > 1 else None, str(max(amounts)))
        
        return (None, None)
    
    def extract_target_groups(self, soup: BeautifulSoup, description: str) -> List[str]:
        """Extract target groups from content."""
        text = (soup.get_text() + ' ' + description).lower()
        
        target_groups = []
        
        if 'små och medelstora' in text or 'sme' in text or 'smf' in text:
            target_groups.append('sme')
        if 'startup' in text or 'nystartade' in text:
            target_groups.append('startup')
        if 'ideell' in text or 'förening' in text:
            target_groups.append('nonprofit')
        if 'kommun' in text or 'region' in text or 'offentlig' in text:
            target_groups.append('government')
        if 'universitet' in text or 'högskola' in text or 'forskning' in text:
            target_groups.append('research')
        
        return target_groups if target_groups else ['sme']
    
    def extract_keywords(self, soup: BeautifulSoup, title: str, description: str) -> List[str]:
        """Extract relevant keywords from content."""
        text = f"{title} {description}".lower()
        
        keyword_map = {
            'innovation': 'innovation',
            'digitalisering': 'digitalisering',
            'hållbar': 'hållbarhet',
            'miljö': 'miljö',
            'export': 'export',
            'internationalisering': 'internationalisering',
            'energi': 'energi',
            'klimat': 'klimat',
            'cirkulär': 'cirkulär ekonomi',
            'forskning': 'forskning',
            'kompetens': 'kompetensutveckling',
            'tillväxt': 'tillväxt',
            'EU': 'EU-finansiering',
            'regional': 'regional utveckling'
        }
        
        keywords = []
        for key, value in keyword_map.items():
            if key.lower() in text:
                keywords.append(value)
        
        return keywords if keywords else ['tillväxt', 'finansiering']
    
    def fetch_from_api(self) -> List[Dict[str, Any]]:
        """Fetch grants from Tillväxtverket API."""
        api_config = self.source.get('api_config') or {}
        headers = {
            'Accept': 'application/json',
            'User-Agent': 'getgrant.ai Scraper'
        }
        
        if api_config.get('api_key'):
            headers['Authorization'] = f"Bearer {api_config['api_key']}"
        
        response = requests.get(self.url, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        items = data if isinstance(data, list) else data.get('items', data.get('results', []))
        
        grants = []
        for item in items:
            grant = self.transform_tillvaxtverket_data(item)
            if grant['title']:
                grants.append(grant)
        
        return grants
    
    def scrape_tillvaxtverket_website(self) -> List[Dict[str, Any]]:
        """Scrape Tillväxtverket website directly."""
        default_selectors = {
            'container': '.stod-item, .financing-card, article, .card',
            'title': 'h2, h3, .title, .card-title',
            'description': '.description, .ingress, p, .card-text',
            'deadline': '.deadline, .date, .meta-date',
            'link': 'a',
            'amount': '.amount, .belopp, .sum'
        }
        
        if not self.selectors:
            self.selectors = default_selectors
        else:
            for key, value in default_selectors.items():
                if key not in self.selectors:
                    self.selectors[key] = value
        
        if self.scraper_type == 'playwright':
            return self.scrape_with_playwright()
        else:
            return self.scrape_with_beautifulsoup()
    
    def transform_tillvaxtverket_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Tillväxtverket API data to our grant schema."""
        
        deadline = None
        deadline_str = data.get('slutdatum') or data.get('deadline') or data.get('end_date')
        if deadline_str:
            try:
                if isinstance(deadline_str, str):
                    deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                pass
        
        return {
            'title': data.get('rubrik') or data.get('title') or data.get('namn', ''),
            'description': data.get('beskrivning') or data.get('description', ''),
            'source_name': 'Tillväxtverket',
            'source_type': 'myndighet',
            'url': data.get('url') or data.get('link', 'https://tillvaxtverket.se'),
            'deadline': deadline,
            'amount_min': data.get('minBelopp') or data.get('min_amount'),
            'amount_max': data.get('maxBelopp') or data.get('max_amount'),
            'eligibility_criteria': data.get('krav') or data.get('eligibility'),
            'target_group': data.get('malgrupp', ['sme']),
            'keywords': data.get('nyckelord', ['tillväxt', 'finansiering']),
            'application_requirements': data.get('ansokanskrav'),
            'status': self._map_status(data.get('status', 'open')),
            'raw_data': data
        }
    
    def _map_status(self, status: str) -> str:
        """Map status to our enum."""
        if not status:
            return 'open'
        
        status_lower = status.lower()
        if status_lower in ['aktiv', 'oppen', 'open', 'pågående']:
            return 'open'
        elif status_lower in ['kommande', 'upcoming', 'planerad']:
            return 'upcoming'
        elif status_lower in ['avslutad', 'closed', 'stängd']:
            return 'closed'
        return 'open'


def create_tillvaxtverket_scraper(source: Dict[str, Any]) -> TillvaxtverketScraper:
    """Factory function to create a Tillväxtverket scraper."""
    return TillvaxtverketScraper(source)
