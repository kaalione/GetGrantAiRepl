import requests
from bs4 import BeautifulSoup
from datetime import datetime
import time
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import upsert_grant, log_scrape_result
from utils.dedup import is_duplicate

os.environ.setdefault('LD_LIBRARY_PATH', '/nix/store/xvzz97yk73hw03v5dhhz3j47ggwf1yq1-gcc-13.2.0-lib/lib')

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False


class BaseScraper:
    def __init__(self, source_id=None):
        self.source_id = source_id
        self.base_url = ""
        self.source_name = ""
        self.organization = ""
        self.default_category = "general"
        # 'se'/'no'/'fi' for national sources, 'eu' for EU-wide/multinational
        # programmes (visible in every market). None keeps the DB default.
        self.market = None
        self.headers = {
            'User-Agent': 'GetGrant.ai Bot/1.0 (grant aggregator; contact@getgrant.ai)',
            'Accept-Language': 'sv-SE,sv;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }

    def fetch_page(self, url, timeout=30, parser='html.parser'):
        try:
            response = requests.get(url, headers=self.headers, timeout=timeout)
            response.raise_for_status()
            return BeautifulSoup(response.content, parser)
        except Exception as e:
            print(f"  Error fetching {url}: {e}")
            return None

    def fetch_page_playwright(self, url, wait_selector=None, timeout=30000):
        if not PLAYWRIGHT_AVAILABLE:
            print("  Playwright not available, falling back to requests")
            return self.fetch_page(url)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(url, wait_until='networkidle', timeout=timeout)
                if wait_selector:
                    try:
                        page.wait_for_selector(wait_selector, timeout=10000)
                    except Exception:
                        pass
                html = page.content()
                browser.close()
                return BeautifulSoup(html, 'html.parser')
        except Exception as e:
            print(f"  Error fetching {url} with Playwright: {e}")
            return None

    def rate_limit(self, seconds=2):
        time.sleep(seconds)

    def parse_deadline(self, date_text):
        if not date_text:
            return None
        date_text = date_text.strip()
        nordic_months = {
            'januari': 1, 'februari': 2, 'mars': 3, 'april': 4,
            'maj': 5, 'juni': 6, 'juli': 7, 'augusti': 8,
            'september': 9, 'oktober': 10, 'november': 11, 'december': 12,
            'januar': 1, 'mars': 3,
            'mai': 5, 'august': 8,
            'desember': 12,
            'tammikuu': 1, 'helmikuu': 2, 'maaliskuu': 3, 'huhtikuu': 4,
            'toukokuu': 5, 'kesäkuu': 6, 'heinäkuu': 7, 'elokuu': 8,
            'syyskuu': 9, 'lokakuu': 10, 'marraskuu': 11, 'joulukuu': 12,
            'tammi': 1, 'helmi': 2, 'maalis': 3, 'huhti': 4,
            'touko': 5, 'kesä': 6, 'heinä': 7, 'elo': 8,
            'syys': 9, 'loka': 10, 'marras': 11, 'joulu': 12,
        }
        for month_name, month_num in nordic_months.items():
            if month_name in date_text.lower():
                try:
                    day_match = re.search(r'(\d{1,2})', date_text)
                    if not day_match:
                        continue
                    day = int(day_match.group(1))
                    year_match = re.search(r'(20\d{2})', date_text)
                    year = int(year_match.group(1)) if year_match else datetime.now().year
                    return datetime(year, month_num, day)
                except:
                    pass
        try:
            return datetime.strptime(date_text[:10], '%Y-%m-%d')
        except:
            pass
        for fmt in ['%d/%m/%Y', '%d.%m.%Y', '%Y-%m-%dT%H:%M:%S']:
            try:
                return datetime.strptime(date_text.strip(), fmt)
            except:
                pass
        return None

    def extract_amount(self, text):
        if not text:
            return None, None, text
        amount_min = None
        amount_max = None
        text_lower = text.lower()
        mnok = re.findall(r'(\d+(?:[.,]\d+)?)\s*mnok', text_lower)
        for m in mnok:
            val = float(m.replace(',', '.')) * 1_000_000
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val
        millions = re.findall(r'(\d+(?:[.,]\d+)?)\s*millio?n(?:er)?', text_lower)
        if millions:
            for m in millions:
                val = float(m.replace(',', '.')) * 1_000_000
                if amount_max is None or val > amount_max:
                    amount_max = val
                if amount_min is None or val < amount_min:
                    amount_min = val
        mill = re.findall(r'(\d+(?:[.,]\d+)?)\s*mill?\.\s*(?:kr)?', text_lower)
        if mill:
            for m in mill:
                val = float(m.replace(',', '.')) * 1_000_000
                if amount_max is None or val > amount_max:
                    amount_max = val
                if amount_min is None or val < amount_min:
                    amount_min = val
        thousands = re.findall(r'(\d[\d\s]*\d)\s*(?:kr|sek|nok|kronor|kroner)', text_lower)
        if thousands:
            for t in thousands:
                val = int(t.replace(' ', ''))
                if amount_max is None or val > amount_max:
                    amount_max = val
                if amount_min is None or val < amount_min:
                    amount_min = val
        nok_amounts = re.findall(r'NOK\s*([\d\s]+(?:\.\d+)?)', text)
        for n in nok_amounts:
            val = int(n.replace(' ', '').replace('.', ''))
            if val > 0:
                if amount_max is None or val > amount_max:
                    amount_max = val
                if amount_min is None or val < amount_min:
                    amount_min = val
        meur = re.findall(r'(\d+(?:[.,]\d+)?)\s*M€', text)
        for m in meur:
            val = float(m.replace(',', '.')) * 1_000_000
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val
        teur = re.findall(r'(\d+(?:[.,]\d+)?)\s*t€', text)
        for t in teur:
            val = float(t.replace(',', '.')) * 1_000
            if amount_max is None or val > amount_max:
                amount_max = val
            if amount_min is None or val < amount_min:
                amount_min = val
        eur_amounts = re.findall(r'(?:€|EUR)\s*([\d\s]+(?:[.,]\d+)?)', text)
        for e in eur_amounts:
            val_str = e.replace(' ', '').replace(',', '.')
            try:
                val = float(val_str)
                if val > 0:
                    if amount_max is None or val > amount_max:
                        amount_max = val
                    if amount_min is None or val < amount_min:
                        amount_min = val
            except ValueError:
                pass
        euroa = re.findall(r'([\d\s]+)\s*euroa', text_lower)
        for e in euroa:
            val = int(e.replace(' ', ''))
            if val > 0:
                if amount_max is None or val > amount_max:
                    amount_max = val
                if amount_min is None or val < amount_min:
                    amount_min = val
        if amount_min == amount_max:
            amount_min = None
        return amount_min, amount_max, text

    def determine_status(self, deadline=None, status_text=None):
        if status_text:
            status_lower = status_text.lower()
            if any(w in status_lower for w in ['stängd', 'avslutad', 'closed', 'slut', 'stengt', 'avsluttet', 'lukket', 'suljettu', 'päättynyt']):
                return 'closed'
            if any(w in status_lower for w in ['öppen', 'pågående', 'open', 'ansök nu', 'aktuell', 'åpen', 'søk nå', 'aktiv', 'avoin', 'haettavissa', 'haku auki']):
                return 'open'
            if any(w in status_lower for w in ['kommande', 'planerad', 'upcoming', 'kommende', 'planlagt', 'tulossa', 'suunniteltu']):
                return 'upcoming'
        if deadline:
            if isinstance(deadline, str):
                deadline = self.parse_deadline(deadline)
            if deadline and deadline < datetime.now():
                return 'closed'
            return 'open'
        return 'open'

    def extract_keywords(self, title, description=''):
        keywords = []
        text = f"{title} {description}".lower()
        keyword_map = [
            'innovation', 'forskning', 'utveckling', 'hållbarhet',
            'export', 'internationalisering', 'digitalisering',
            'klimat', 'miljö', 'grön omställning', 'cirkulär ekonomi',
            'energi', 'förnybar', 'startup', 'entreprenörskap',
            'ai', 'artificiell intelligens', 'automation',
            'landsbygd', 'jordbruk', 'livsmedel', 'skog',
            'kultur', 'design', 'kreativ', 'media',
            'hälsa', 'vård', 'omsorg', 'välfärd',
            'transport', 'infrastruktur', 'bygg', 'bostad',
            'utbildning', 'kompetens', 'arbetsmarknad',
            'jämställdhet', 'integration', 'tillgänglighet',
            'bredband', 'digital', 'it', 'cyber',
            'samhälle', 'demokrati', 'säkerhet',
            'utvikling', 'bærekraft', 'klima', 'miljø',
            'grønn omstilling', 'sirkulær økonomi',
            'fornybar', 'gründer', 'næringsliv',
            'helse', 'omsorg', 'velferd',
            'landbruk', 'fiskeri', 'havbruk', 'maritim',
            'kompetanse', 'likestilling',
            'innovaatio', 'tutkimus', 'kehitys', 'kestävyys',
            'vienti', 'kansainvälistyminen', 'digitalisaatio',
            'ilmasto', 'ympäristö', 'kiertotalous',
            'energia', 'uusiutuva', 'yrittäjyys',
            'terveys', 'hyvinvointi', 'maatalous',
            'metsä', 'elintarvike', 'teknologia',
        ]
        for kw in keyword_map:
            if kw in text:
                keywords.append(kw)
        return keywords[:15]

    def extract_target_groups(self, text):
        if not text:
            return ['all']
        text_lower = text.lower()
        groups = []
        if any(w in text_lower for w in ['startup', 'nystartade', 'nya företag', 'oppstart', 'gründer', 'aloittava yritys', 'kasvuyritys']):
            groups.append('startup')
        if any(w in text_lower for w in ['små och medelstora', 'sme', 'små företag', 'smb', 'små og mellomstore', 'pk-yritys', 'pienet ja keskisuuret']):
            groups.append('sme')
        if any(w in text_lower for w in ['forskare', 'universitet', 'högskola', 'akademi', 'forsker', 'forskning', 'tutkija', 'yliopisto', 'tutkimus']):
            groups.append('research')
        if any(w in text_lower for w in ['ideell', 'förening', 'organisation', 'frivillig', 'yhdistys', 'järjestö']):
            groups.append('nonprofit')
        if any(w in text_lower for w in ['kommun', 'region', 'offentlig', 'fylkeskommune', 'offentlige', 'kunta', 'julkinen']):
            groups.append('public_sector')
        if any(w in text_lower for w in ['storföretag', 'koncern', 'industri', 'store bedrift', 'suuryritys']):
            groups.append('large_enterprise')
        if any(w in text_lower for w in ['enskild firma', 'egenföretagare', 'frilans', 'enkeltpersonforetak', 'toiminimi', 'yrittäjä']):
            groups.append('sole_proprietor')
        return groups or ['all']

    def transform_to_grant(self, raw_data):
        amount_min, amount_max, amount_desc = self.extract_amount(
            raw_data.get('amount_text', '')
        )
        deadline = self.parse_deadline(raw_data.get('deadline_text'))
        description = raw_data.get('description', '').strip()
        title = raw_data.get('title', '').strip()

        eligibility_text = raw_data.get('eligibility', '').strip()
        eligibility_criteria = None
        if eligibility_text:
            eligibility_criteria = {'text': eligibility_text}

        keywords = self.extract_keywords(title, description)
        target_group = self.extract_target_groups(
            eligibility_text or description
        )

        return {
            'title': title[:500],
            'description': description[:5000] if description else f"Bidrag från {self.source_name}: {title}",
            'source_name': self.source_name,
            'source_type': 'myndighet',
            'url': raw_data.get('url', ''),
            'deadline': deadline,
            'status': self.determine_status(deadline, raw_data.get('status_text')),
            'amount_min': amount_min,
            'amount_max': amount_max,
            'eligibility_criteria': eligibility_criteria,
            'keywords': keywords,
            'target_group': target_group,
            'application_requirements': None,
            'market': self.market,
            'raw_data': {'scraped_at': datetime.now().isoformat(), 'source': self.source_name, 'category': raw_data.get('category', self.default_category)},
        }

    def scrape(self):
        print(f"{'='*60}")
        print(f"SCRAPING: {self.source_name}")
        print(f"URL: {self.base_url}")
        print(f"{'='*60}")

        try:
            grants_data = self.fetch_grants()

            processed_grants = []
            grants_inserted = 0
            for raw in grants_data:
                grant = self.transform_to_grant(raw)
                if not grant['title'] or not grant['url']:
                    continue
                dup, dup_id = is_duplicate(grant, processed_grants)
                if dup:
                    print(f"  Skipping duplicate: {grant['title'][:50]}")
                    continue
                upsert_grant(grant)
                processed_grants.append(grant)
                grants_inserted += 1

            if self.source_id:
                log_scrape_result(
                    source_id=self.source_id,
                    status='success',
                    grants_found=grants_inserted,
                    error_message=None
                )

            print(f"  Inserted/updated: {grants_inserted} grants")
            return grants_inserted

        except Exception as e:
            error_msg = str(e)
            print(f"  FAILED: {error_msg}")
            import traceback
            traceback.print_exc()

            if self.source_id:
                log_scrape_result(
                    source_id=self.source_id,
                    status='failed',
                    grants_found=0,
                    error_message=error_msg
                )
            return 0

    def fetch_grants(self):
        raise NotImplementedError("Subclasses must implement fetch_grants()")
