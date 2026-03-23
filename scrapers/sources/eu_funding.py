#!/usr/bin/env python3
import sys
import os
import requests
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import upsert_grant, log_scrape_result


class EUFundingScraper:
    SEARCH_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
    PORTAL_BASE = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details"

    STATUS_CODES = {
        'open': ['31094501', '31094502'],
        'closed': ['31094503'],
        'all': ['31094501', '31094502', '31094503']
    }

    TYPE_CODES = {
        'tenders': ['0'],
        'grants': ['1', '2', '8'],
        'all': ['0', '1', '2', '8']
    }

    PROGRAMME_IDS = {
        'horizon': 43108390,
        'digital': 43152860,
        'life': 43252405,
        'erasmus': 43353764,
        'cerv': 43251589,
        'cef': 43251567,
        'smp': 43252476,
        'innovfund': 43089234,
        'eu4health': 43332642,
        'edf': 44181033,
    }

    def __init__(self, source_id=None):
        self.source_id = source_id
        self.session = requests.Session()
        retry = requests.adapters.HTTPAdapter(max_retries=3)
        self.session.mount("https://", retry)

    def query_api(self, query: dict, page_num: int = 1, page_size: int = 100) -> dict:
        params = {
            "apiKey": "SEDIA",
            "text": "***",
            "pageSize": str(page_size),
            "pageNumber": str(page_num),
        }
        sort = {"field": "lastModified", "order": "DESC"}
        form_data = {
            "query": ("blob", json.dumps(query), "application/json"),
            "sort": ("blob", json.dumps(sort), "application/json"),
            "languages": ("blob", json.dumps(["en"]), "application/json"),
        }
        try:
            response = self.session.post(self.SEARCH_URL, params=params, files=form_data, timeout=60)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"  API error: {e}")
            return {}

    def build_query(self, funding_type='grants', status='open', programmes=None) -> dict:
        query = {"bool": {"must": []}}
        if funding_type in self.TYPE_CODES:
            query["bool"]["must"].append({"terms": {"type": self.TYPE_CODES[funding_type]}})
        if status in self.STATUS_CODES:
            query["bool"]["must"].append({"terms": {"status": self.STATUS_CODES[status]}})
        if programmes:
            prog_ids = []
            for p in (programmes if isinstance(programmes, list) else [programmes]):
                if isinstance(p, str) and p.lower() in self.PROGRAMME_IDS:
                    prog_ids.append(str(self.PROGRAMME_IDS[p.lower()]))
                elif isinstance(p, int):
                    prog_ids.append(str(p))
            if prog_ids:
                query["bool"]["must"].append({"terms": {"frameworkProgramme": prog_ids}})
        return query

    def fetch_all_grants(self, funding_type='grants', status='open', programmes=None, max_results=None) -> List[dict]:
        query = self.build_query(funding_type, status, programmes)
        first_page = self.query_api(query, page_num=1, page_size=100)
        if not first_page or 'results' not in first_page:
            return []

        total = first_page.get('totalResults', 0)
        target = min(total, max_results) if max_results else total
        print(f"  EU API reports {total} total results (fetching all {target})")

        all_results = first_page.get('results', [])
        pages_needed = (target + 99) // 100

        for page in range(2, pages_needed + 1):
            if len(all_results) >= target:
                break
            import time
            time.sleep(1)
            print(f"  Fetching page {page}/{pages_needed}...")
            data = self.query_api(query, page_num=page, page_size=100)
            if data and 'results' in data:
                all_results.extend(data['results'])
            else:
                break

        return all_results[:target]

    def transform_to_grant(self, result: dict) -> Optional[Dict[str, Any]]:
        metadata = result.get('metadata', {})

        def get_first(field, default=None):
            val = metadata.get(field, [default])
            if isinstance(val, list) and val:
                return val[0]
            return val or default

        title = get_first('title', '')
        if not title or title == '***':
            return None

        identifier = get_first('identifier', '')
        topic_url = f"{self.PORTAL_BASE}/{identifier}" if identifier else None

        call_id = get_first('callIdentifier', '')
        call_url = None
        if call_id:
            call_url = f"https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search;callCode={call_id}"

        url = topic_url or call_url
        if not url:
            return None

        description_parts = []
        call_title = get_first('callTitle', '')
        if call_title and call_title != title:
            description_parts.append(call_title)

        keywords_raw = metadata.get('keywords', [])
        if isinstance(keywords_raw, list):
            keywords = [k for k in keywords_raw if isinstance(k, str)][:15]
        else:
            keywords = []

        programme_names = metadata.get('programmePeriod', [])
        framework = metadata.get('frameworkProgramme', [])
        if isinstance(framework, list):
            for fw in framework:
                if isinstance(fw, str) and fw not in description_parts:
                    description_parts.append(f"Programme: {fw}")

        full_desc = get_first('description', '')
        sme_desc = get_first('smedescription', '')
        if full_desc and len(full_desc) > 50:
            description_parts.append(self._strip_html(full_desc))
        elif sme_desc:
            description_parts.append(sme_desc)

        further_info = get_first('furtherInformation', '')
        if further_info and len(further_info) > 30:
            cleaned = self._strip_html(further_info)
            if cleaned and cleaned not in description_parts:
                description_parts.append(cleaned)

        full_description = '\n\n'.join(description_parts) if description_parts else title

        deadline = None
        deadline_dates = metadata.get('deadlineDates', [])
        if isinstance(deadline_dates, list) and deadline_dates:
            try:
                date_str = deadline_dates[0].split('+')[0].split('.')[0]
                deadline = datetime.fromisoformat(date_str)
            except (ValueError, IndexError):
                pass

        if not deadline:
            deadline_str = get_first('deadlineDate', '')
            if deadline_str:
                try:
                    deadline = datetime.fromisoformat(deadline_str.split('+')[0].split('.')[0])
                except (ValueError, IndexError):
                    pass

        status_code = get_first('status', '')
        if status_code in ['31094501', '31094502']:
            status = 'open'
        elif status_code == '31094503':
            status = 'closed'
        else:
            status = 'open' if deadline and deadline > datetime.now() else 'closed'

        amount_str = get_first('budgetOverviewTotalBudget', '')
        amount_max = None
        if amount_str:
            try:
                cleaned = amount_str.replace(',', '').replace(' ', '').replace('€', '').replace('EUR', '')
                amount_max = float(cleaned)
            except (ValueError, TypeError):
                pass

        target_groups = self._determine_target_groups(full_description, metadata)

        grant = {
            'title': title[:500],
            'description': full_description[:5000],
            'source_name': 'EU Funding & Tenders',
            'source_type': 'eu',
            'url': url,
            'deadline': deadline,
            'amount_min': None,
            'amount_max': amount_max,
            'eligibility_criteria': self._build_eligibility(metadata, identifier, call_id, programme_names),
            'target_group': target_groups,
            'keywords': keywords,
            'application_requirements': None,
            'status': status,
            'raw_data': metadata,
        }
        return grant

    def _build_eligibility(self, metadata: dict, identifier: str, call_id: str, programme_names) -> dict:
        def get_first(field, default=None):
            val = metadata.get(field, [default])
            if isinstance(val, list) and val:
                return val[0]
            return val or default

        elig = {
            'identifier': identifier,
            'callIdentifier': call_id,
            'type': get_first('type', ''),
            'programmes': programme_names if isinstance(programme_names, list) else [],
        }

        beneficiary = get_first('beneficiaryAdministration', '')
        if beneficiary and len(beneficiary) > 10:
            elig['who_can_apply'] = self._strip_html(beneficiary)

        deadline_model = get_first('deadlineModel', '')
        if deadline_model:
            elig['deadline_model'] = deadline_model

        duration = get_first('duration', '')
        if duration:
            elig['project_duration'] = duration

        budget = get_first('budget', '') or get_first('budgetOverviewTotalBudget', '')
        if budget:
            elig['total_budget'] = budget

        ca_name = get_first('caName', '')
        if ca_name:
            elig['call_name'] = ca_name

        return elig

    def _strip_html(self, html_text: str) -> str:
        import re
        if not html_text:
            return ''
        text = re.sub(r'<[^>]+>', ' ', html_text)
        text = re.sub(r'\s+', ' ', text).strip()
        text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&nbsp;', ' ').replace('&#39;', "'").replace('&quot;', '"')
        return text

    def _determine_target_groups(self, description: str, metadata: dict) -> List[str]:
        groups = []
        desc_lower = description.lower()

        patterns = {
            'sme': ['sme', 'small and medium', 'small enterprise', 'startup', 'scale-up'],
            'research': ['university', 'research', 'academic', 'researcher', 'higher education'],
            'nonprofit': ['civil society', 'ngo', 'non-governmental', 'non-profit', 'association'],
            'enterprise': ['industry', 'private sector', 'company', 'corporation'],
            'public': ['public body', 'municipality', 'public authority', 'government', 'regional authority'],
        }

        for group, kws in patterns.items():
            if any(kw in desc_lower for kw in kws):
                groups.append(group)

        if not groups:
            groups.append('all')
        return groups

    def scrape(self, source_id=None, max_results=None) -> int:
        sid = source_id or self.source_id
        print(f"\n{'='*60}")
        print("Starting EU Funding & Tenders Portal scrape...")
        print(f"{'='*60}")

        try:
            results = self.fetch_all_grants(
                funding_type='grants',
                status='open',
                max_results=max_results
            )

            if not results:
                print("No grants found from EU API")
                if sid:
                    log_scrape_result(source_id=sid, status='success', grants_found=0, error_message='No results from API')
                return 0

            print(f"Processing {len(results)} EU grants...")

            inserted = 0
            skipped = 0

            for result in results:
                try:
                    grant = self.transform_to_grant(result)
                    if grant and grant['title'] and grant['url']:
                        upsert_grant(grant)
                        inserted += 1
                    else:
                        skipped += 1
                except Exception as e:
                    skipped += 1
                    print(f"  Error processing grant: {e}")

            if sid:
                log_scrape_result(source_id=sid, status='success', grants_found=inserted)

            print(f"\n{'='*60}")
            print(f"EU RESULTS:")
            print(f"  Inserted/Updated: {inserted} grants")
            print(f"  Skipped: {skipped}")
            print(f"{'='*60}")

            return inserted

        except Exception as e:
            error_msg = str(e)
            print(f"EU scrape failed: {error_msg}")
            if sid:
                log_scrape_result(source_id=sid, status='failed', grants_found=0, error_message=error_msg)
            import traceback
            traceback.print_exc()
            return 0


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='EU Funding & Tenders Scraper')
    parser.add_argument('--max-results', type=int, default=None, help='Maximum grants to fetch (default: all)')
    parser.add_argument('--test', action='store_true', help='Test API without saving')
    args = parser.parse_args()

    scraper = EUFundingScraper()

    if args.test:
        print("Testing EU API connection...")
        query = scraper.build_query('grants', 'open')
        data = scraper.query_api(query, page_num=1, page_size=5)
        total = data.get('totalResults', 0)
        print(f"API reports {total} open grants")
        for r in data.get('results', [])[:5]:
            m = r.get('metadata', {})
            title = m.get('title', ['?'])
            if isinstance(title, list):
                title = title[0] if title else '?'
            print(f"  - {title[:80]}")
    else:
        result = scraper.scrape(max_results=args.max_results)
        print(f"\nScrape complete: {result} grants processed")
