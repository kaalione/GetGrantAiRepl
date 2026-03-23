import sys
import os
from typing import List, Dict, Any
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import upsert_grant
from sources.generic_scraper import GenericScraper


class VinnovaScraper(GenericScraper):
    """Scraper specifically for Vinnova grants using the GDP API."""
    
    VINNOVA_API_URL = "https://www.vinnova.se/api/utlysningar"
    
    def __init__(self, source: Dict[str, Any]):
        super().__init__(source)
        api_config = source.get('api_config') or {}
        self.api_key = api_config.get('api_key')
    
    def scrape(self) -> int:
        """Scrape Vinnova grants.
        
        Note: Log entries are managed by the Node.js API that triggers this scraper.
        """
        if self.source['type'] == 'api':
            grants = self.fetch_from_api()
        else:
            grants = self.scrape_vinnova_website()
        
        for grant in grants:
            upsert_grant(grant)
        
        print(f"[Vinnova] Successfully scraped {len(grants)} grants found")
        return len(grants)
    
    def fetch_from_api(self) -> List[Dict[str, Any]]:
        """Fetch grants from Vinnova API, with web scraping as fallback."""
        import requests
        
        # Try Vinnova's direct API first
        try:
            raw_data = self._fetch_vinnova_direct_api()
            if raw_data:
                grants = []
                for item in raw_data:
                    grant = self.transform_vinnova_data(item)
                    if grant['title']:
                        grants.append(grant)
                if grants:
                    return grants
        except requests.exceptions.RequestException as e:
            print(f"[Vinnova] Direct API failed: {e}")
        except Exception as e:
            print(f"[Vinnova] Error processing API response: {e}")
        
        # Fallback to web scraping (more reliable than external GDP API)
        print("[Vinnova] Falling back to web scraping...")
        return self.scrape_vinnova_website()
    
    def _fetch_vinnova_direct_api(self) -> List[Dict[str, Any]]:
        """Fetch directly from Vinnova's website API."""
        import requests
        
        response = requests.get(
            self.VINNOVA_API_URL,
            headers={'Accept': 'application/json', 'User-Agent': 'getgrant.ai Scraper'},
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    
    def scrape_vinnova_website(self) -> List[Dict[str, Any]]:
        """Scrape Vinnova website directly."""
        default_selectors = {
            'container': '.funding-item, .utlysning-item, article',
            'title': 'h2, h3, .title, .rubrik',
            'description': '.description, .ingress, p',
            'deadline': '.deadline, .slutdatum, .date',
            'link': 'a'
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
    
    def transform_vinnova_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Vinnova API data to our grant schema."""
        
        deadline = None
        deadline_str = data.get('slutdatum') or data.get('deadline') or data.get('ansokansdeadline')
        if deadline_str:
            try:
                deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                pass
        
        target_groups = data.get('malgrupper', [])
        if isinstance(target_groups, str):
            target_groups = [target_groups]
        
        mapped_targets = []
        for group in target_groups:
            group_lower = group.lower() if group else ''
            if 'startup' in group_lower or 'nystart' in group_lower:
                mapped_targets.append('startup')
            elif 'sme' in group_lower or 'små' in group_lower or 'medelstora' in group_lower:
                mapped_targets.append('sme')
            elif 'ideell' in group_lower or 'förening' in group_lower:
                mapped_targets.append('nonprofit')
            else:
                mapped_targets.append('sme')
        
        keywords = data.get('nyckelord', []) or data.get('amnesomraden', []) or []
        if isinstance(keywords, str):
            keywords = [keywords]
        
        return {
            'title': data.get('rubrik') or data.get('title') or data.get('namn', ''),
            'description': data.get('beskrivning') or data.get('ingress') or data.get('description', ''),
            'source_name': 'Vinnova',
            'source_type': 'myndighet',
            'url': data.get('url') or data.get('lanksida') or data.get('link', 'https://www.vinnova.se'),
            'deadline': deadline,
            'amount_min': data.get('minBelopp') or data.get('amount_min'),
            'amount_max': data.get('maxBelopp') or data.get('amount_max'),
            'eligibility_criteria': data.get('behorighetskriterier') or data.get('eligibility'),
            'target_group': mapped_targets or ['sme'],
            'keywords': keywords,
            'application_requirements': data.get('ansokanskrav') or data.get('requirements'),
            'status': self._map_status(data.get('status', 'open')),
            'raw_data': data
        }
    
    def _map_status(self, status: str) -> str:
        """Map Vinnova status to our enum."""
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


def create_vinnova_scraper(source: Dict[str, Any]) -> VinnovaScraper:
    """Factory function to create a Vinnova scraper."""
    return VinnovaScraper(source)
