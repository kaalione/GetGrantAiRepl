import requests
from typing import List, Dict, Any, Optional
from datetime import datetime

class GDPApiClient:
    """Client for the Swedish GDP (Gemensam Databas för Projektfinansieringar) API."""
    
    BASE_URL = "https://gdp.tillvaxtverket.se/api"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.session = requests.Session()
        if api_key:
            self.session.headers.update({'Authorization': f'Bearer {api_key}'})
    
    def fetch_utlysningar(self, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Fetch funding calls (utlysningar) from the GDP API.
        
        Raises requests.exceptions.RequestException on failure to allow proper error propagation.
        """
        url = f"{self.BASE_URL}/utlysningar"
        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    
    def fetch_aktiviteter(self, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Fetch funded activities from the GDP API.
        
        Raises requests.exceptions.RequestException on failure to allow proper error propagation.
        """
        url = f"{self.BASE_URL}/aktiviteter"
        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()


def transform_gdp_to_grant_schema(gdp_data: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """Transform GDP API response to our grant database schema."""
    
    deadline = None
    if gdp_data.get('slutdatum'):
        try:
            deadline = datetime.fromisoformat(gdp_data['slutdatum'].replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            pass
    
    return {
        'title': gdp_data.get('rubrik') or gdp_data.get('namn', 'Okänd utlysning'),
        'description': gdp_data.get('beskrivning', ''),
        'source_name': source_name,
        'source_type': 'myndighet',
        'url': gdp_data.get('url') or gdp_data.get('lanksida', ''),
        'deadline': deadline,
        'amount_min': gdp_data.get('minBelopp'),
        'amount_max': gdp_data.get('maxBelopp'),
        'eligibility_criteria': gdp_data.get('behorighetskriterier'),
        'target_group': gdp_data.get('malgrupper', []),
        'keywords': gdp_data.get('nyckelord', []),
        'application_requirements': gdp_data.get('ansokanskrav'),
        'status': map_status(gdp_data.get('status', 'open')),
        'raw_data': gdp_data
    }


def map_status(gdp_status: str) -> str:
    """Map GDP API status to our status enum."""
    status_map = {
        'aktiv': 'open',
        'kommande': 'upcoming',
        'avslutad': 'closed',
        'oppen': 'open',
        'open': 'open',
        'upcoming': 'upcoming',
        'closed': 'closed'
    }
    return status_map.get(gdp_status.lower(), 'open')
