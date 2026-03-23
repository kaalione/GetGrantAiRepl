#!/usr/bin/env python3
"""
Vinnova Free Open Data API Client

Uses Vinnova's completely FREE and OPEN API - no authentication required!
API: https://data.vinnova.se/api
License: Public Domain (CC0)
"""

import sys
import os
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import upsert_grant, log_scrape_result


class VinnovaApiClient:
    """
    Client for Vinnova's free open data API.
    No authentication required - completely open!
    Docs: https://data.vinnova.se
    """
    
    def __init__(self):
        self.base_url = "https://data.vinnova.se/api"
    
    def fetch_ansokningsomgangar(self, from_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch grant calls (ansökningsomgångar) modified since from_date.
        
        Args:
            from_date: Date string in format YYYY-MM-DD.
                      If None, fetches from 180 days ago.
        
        Returns:
            List of ansökningsomgångar in Vinnova format.
        """
        if not from_date:
            date_180_days_ago = datetime.now() - timedelta(days=180)
            from_date = date_180_days_ago.strftime('%Y-%m-%d')
        
        try:
            url = f"{self.base_url}/ansokningsomgangar/{from_date}"
            print(f"Fetching from: {url}")
            
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if isinstance(data, list):
                print(f"Found {len(data)} ansökningsomgångar from API")
                return data
            else:
                print("Unexpected response format from Vinnova API")
                return []
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching Vinnova data: {e}")
            return []
    
    def fetch_utlysningar(self, from_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch announcements (utlysningar) modified since from_date.
        
        Args:
            from_date: Date string in format YYYY-MM-DD.
        
        Returns:
            List of utlysningar in Vinnova format.
        """
        if not from_date:
            date_180_days_ago = datetime.now() - timedelta(days=180)
            from_date = date_180_days_ago.strftime('%Y-%m-%d')
        
        try:
            url = f"{self.base_url}/utlysningar/{from_date}"
            print(f"Fetching utlysningar from: {url}")
            
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            
            if isinstance(data, list):
                print(f"Found {len(data)} utlysningar from API")
                return data
            else:
                print("Unexpected response format")
                return []
            
        except requests.exceptions.RequestException as e:
            print(f"Error fetching utlysningar: {e}")
            return []
    
    def transform_to_grant(self, vinnova_item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform Vinnova ansökningsomgång format to getgrant.ai grant schema.
        
        Vinnova fields:
        - Diarienummer: Case ID (unique identifier)
        - Titel: Title
        - Beskrivning: Description
        - Stangningsdatum: Closing date (deadline)
        - Oppningsdatum: Opening date
        - DokumentLista: List of downloadable documents
        - LankLista: Links to application pages
        - WebTextLista: Short texts about What/Who/How
        - Publik: 1=public, 0=invite-only
        - Extern: 1=external submission, 0=via Vinnova
        """
        
        deadline = None
        if vinnova_item.get('Stangningsdatum'):
            try:
                deadline_str = vinnova_item['Stangningsdatum']
                if 'T' in deadline_str:
                    deadline = datetime.fromisoformat(deadline_str.replace('Z', ''))
                else:
                    deadline = datetime.strptime(deadline_str, '%Y-%m-%d')
            except Exception as e:
                print(f"Could not parse deadline '{vinnova_item.get('Stangningsdatum')}': {e}")
        
        status = 'closed'
        if deadline and deadline > datetime.now():
            status = 'open'
        elif not deadline:
            status = 'open'
        
        application_url = None
        if vinnova_item.get('LankLista'):
            for link in vinnova_item['LankLista']:
                desc = link.get('Beskrivning', '').lower()
                if 'ansök' in desc or 'application' in desc.lower():
                    application_url = link.get('URL')
                    break
                if not application_url and link.get('URL'):
                    application_url = link.get('URL')
        
        diarienummer = vinnova_item.get('Diarienummer', '')
        vinnova_page_url = f"https://www.vinnova.se/e/{diarienummer}/" if diarienummer else None
        
        final_url = application_url or vinnova_page_url or "https://www.vinnova.se"
        
        keywords = []
        description_parts = []
        
        if vinnova_item.get('WebTextLista'):
            for web_text in vinnova_item['WebTextLista']:
                text_sv = web_text.get('TextSv', '')
                if text_sv:
                    description_parts.append(text_sv)
                    keywords.extend(self._extract_keywords_from_text(text_sv))
        
        main_description = vinnova_item.get('Beskrivning', '')
        if description_parts:
            full_description = f"{main_description}\n\n" + "\n\n".join(description_parts)
        else:
            full_description = main_description
        
        target_groups = self._determine_target_groups(full_description)
        
        title = vinnova_item.get('Titel', '')
        keywords.extend(self._extract_keywords_from_text(title))
        
        documents = []
        if vinnova_item.get('DokumentLista'):
            for doc in vinnova_item['DokumentLista']:
                documents.append({
                    'title': doc.get('Titel'),
                    'url': doc.get('fileURL')
                })
        
        grant = {
            'title': title or 'Untitled',
            'description': full_description,
            'source_name': 'Vinnova',
            'source_type': 'myndighet',
            'url': final_url,
            'deadline': deadline,
            'amount_min': None,
            'amount_max': None,
            'eligibility_criteria': {
                'diarienummer': diarienummer,
                'public': vinnova_item.get('Publik') == 1,
                'external_submission': vinnova_item.get('Extern') == 1
            },
            'target_group': target_groups,
            'keywords': list(set(keywords))[:15],
            'application_requirements': {
                'documents': documents
            } if documents else None,
            'status': status,
            'raw_data': vinnova_item
        }
        
        return grant
    
    def _extract_keywords_from_text(self, text: str) -> List[str]:
        """Extract relevant keywords from Swedish text."""
        if not text:
            return []
        
        keywords = []
        text_lower = text.lower()
        
        keyword_patterns = [
            'innovation', 'forskning', 'utveckling', 'hållbarhet',
            'digitalisering', 'export', 'miljö', 'transport',
            'cirkulär ekonomi', 'ai', 'artificiell intelligens',
            'grön omställning', 'klimat', 'energi', 'life science',
            'startup', 'sme', 'företag', 'universitet', 'högskola',
            'industri', 'produktion', 'automation', 'samverkan',
            'mobilitet', 'hälsa', 'medicin', 'bioteknik', 'tech',
            'smart', 'data', 'iot', 'elektrifiering', 'batterier'
        ]
        
        for keyword in keyword_patterns:
            if keyword in text_lower:
                keywords.append(keyword)
        
        return keywords
    
    def _determine_target_groups(self, description: str) -> List[str]:
        """Determine target groups from description text."""
        if not description:
            return ['all']
        
        target_groups = []
        desc_lower = description.lower()
        
        patterns = {
            'startup': ['startup', 'nystartade', 'nya företag', 'nyföretagande', 'scale-up'],
            'sme': ['små och medelstora', 'sme', 'små företag', 'mkb', 'mindre företag'],
            'research': ['forskare', 'universitet', 'högskola', 'forskning', 'akademi', 'doktorand'],
            'nonprofit': ['ideell', 'idéburen', 'förening', 'organisation', 'civilsamhälle'],
            'enterprise': ['storföretag', 'koncern', 'stora företag']
        }
        
        for group, keywords in patterns.items():
            if any(keyword in desc_lower for keyword in keywords):
                target_groups.append(group)
        
        if not target_groups:
            target_groups.append('all')
        
        return target_groups
    
    def scrape(self, source_id: Optional[str] = None, from_date: Optional[str] = None) -> int:
        """
        Main scraping function.
        
        Args:
            source_id: ID from scraper_sources table (for logging).
            from_date: Optional date to fetch from (YYYY-MM-DD).
        
        Returns:
            Number of grants inserted/updated.
        """
        print(f"\n{'='*60}")
        print("Starting Vinnova Free API scrape...")
        print(f"{'='*60}")
        
        try:
            items = self.fetch_ansokningsomgangar(from_date)
            
            if not items:
                print("No data returned from API, trying utlysningar endpoint...")
                items = self.fetch_utlysningar(from_date)
            
            if not items:
                print("No items found from Vinnova API")
                if source_id:
                    log_scrape_result(
                        source_id=source_id,
                        status='success',
                        grants_found=0,
                        error_message='No items returned from API'
                    )
                return 0
            
            print(f"Processing {len(items)} items from Vinnova API")
            
            grants_inserted = 0
            grants_skipped = 0
            
            for item in items:
                try:
                    grant = self.transform_to_grant(item)
                    
                    if grant['title'] and grant['title'] != 'Untitled' and grant['url']:
                        upsert_grant(grant)
                        grants_inserted += 1
                    else:
                        grants_skipped += 1
                        diarienummer = item.get('Diarienummer', 'unknown')
                        print(f"  Skipped: {diarienummer} - missing required fields")
                except Exception as e:
                    grants_skipped += 1
                    print(f"  Error processing item: {e}")
            
            if source_id:
                log_scrape_result(
                    source_id=source_id,
                    status='success',
                    grants_found=grants_inserted,
                    error_message=None
                )
            
            print(f"\n{'='*60}")
            print(f"RESULTS:")
            print(f"  Inserted/Updated: {grants_inserted} grants")
            print(f"  Skipped: {grants_skipped} grants")
            print(f"{'='*60}")
            
            return grants_inserted
            
        except Exception as e:
            error_msg = str(e)
            print(f"Vinnova API scrape failed: {error_msg}")
            
            if source_id:
                log_scrape_result(
                    source_id=source_id,
                    status='failed',
                    grants_found=0,
                    error_message=error_msg
                )
            
            import traceback
            traceback.print_exc()
            
            return 0


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Vinnova Free API Scraper')
    parser.add_argument('--from-date', type=str, help='Fetch grants from this date (YYYY-MM-DD)')
    parser.add_argument('--test', action='store_true', help='Test API connection without saving')
    
    args = parser.parse_args()
    
    client = VinnovaApiClient()
    
    if args.test:
        print("Testing Vinnova API connection...")
        items = client.fetch_ansokningsomgangar(args.from_date)
        print(f"\nAPI returned {len(items)} items")
        if items:
            print("\nSample item:")
            sample = items[0]
            print(f"  Diarienummer: {sample.get('Diarienummer')}")
            print(f"  Titel: {sample.get('Titel')}")
            print(f"  Stängningsdatum: {sample.get('Stangningsdatum')}")
    else:
        result = client.scrape(source_id=None, from_date=args.from_date)
        print(f"\nScrape complete: {result} grants processed")
