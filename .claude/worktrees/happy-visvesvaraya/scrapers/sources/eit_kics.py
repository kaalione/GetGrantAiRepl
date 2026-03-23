import sys
import os
import re
from datetime import datetime
from urllib.parse import urljoin

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sources.base_scraper import BaseScraper

EIT_KICS = [
    {
        "id": "eit-urban-mobility",
        "url": "https://www.eiturbanmobility.eu/call-for-proposals/",
        "label": "EIT Urban Mobility",
        "sector": "Transport/Mobilitet",
        "tags": ["transport", "mobilitet", "stadsplanering", "elfordon"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='call'], [class*='proposal']",
    },
    {
        "id": "eit-food",
        "url": "https://www.eitfood.eu/open-calls",
        "label": "EIT Food",
        "sector": "Livsmedel/Agritech",
        "tags": ["livsmedel", "agritech", "hållbart jordbruk", "matproduktion"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='call'], [class*='open']",
    },
    {
        "id": "eit-health",
        "url": "https://eithealth.eu/new-call-opportunities/",
        "label": "EIT Health",
        "sector": "Hälsa/Life Science",
        "tags": ["hälsa", "life science", "medtech", "sjukvård"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='call'], [class*='opportunit']",
        "pw_timeout": 60000,
    },
    {
        "id": "eit-digital",
        "urls": [
            "https://28digital.eu/all-startup-opportunities/",
            "https://28digital.eu/our-messages/calls-tenders/",
        ],
        "url": "https://28digital.eu/all-startup-opportunities/",
        "label": "EIT Digital (28digital)",
        "sector": "Digitalt/AI",
        "tags": ["digitalt", "AI", "cybersäkerhet", "deeptech"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='opportunit'], [class*='startup']",
    },
    {
        "id": "eit-manufacturing",
        "url": "https://www.eitmanufacturing.eu/calls/",
        "label": "EIT Manufacturing",
        "sector": "Tillverkning/Industri",
        "tags": ["tillverkning", "industri", "automation", "AI"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='call'], [class*='boost']",
    },
    {
        "id": "eit-rawmaterials",
        "urls": [
            "https://eitrawmaterials.eu/knowledge-innovation",
            "https://eitrawmaterials.eu/programmes-and-calls/",
        ],
        "url": "https://eitrawmaterials.eu/knowledge-innovation",
        "label": "EIT RawMaterials",
        "sector": "Råmaterial/Gruvteknik",
        "tags": ["råmaterial", "gruvindustri", "cirkulär ekonomi"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='programme'], [class*='call']",
        "pw_timeout": 60000,
    },
    {
        "id": "eit-climate-kic",
        "urls": [
            "https://www.climate-kic.org/get-involved/open-calls/",
            "https://www.climate-kic.org/programmes/",
        ],
        "url": "https://www.climate-kic.org/get-involved/open-calls/",
        "label": "EIT Climate-KIC",
        "sector": "Klimat/Hållbarhet",
        "tags": ["klimat", "hållbarhet", "cleantech", "CO2"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='call'], [class*='programme']",
        "pw_timeout": 60000,
    },
    {
        "id": "eit-culture-creativity",
        "urls": [
            "https://eit-culture-creativity.eu/your-opportunities/calls-funding",
            "https://eit-culture-creativity.eu/your-opportunities/",
        ],
        "url": "https://eit-culture-creativity.eu/your-opportunities/calls-funding",
        "label": "EIT Culture & Creativity",
        "sector": "Kultur/Kreativa industrier",
        "tags": ["kultur", "kreativa industrier", "media"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='call'], [class*='opportunit']",
    },
    {
        "id": "eit-innoenergy",
        "urls": [
            "https://innoenergy.com/startups/",
            "https://innoenergy.com/for-innovators/",
        ],
        "url": "https://innoenergy.com/startups/",
        "label": "EIT InnoEnergy",
        "sector": "Energi/CleanTech",
        "tags": ["energi", "cleantech", "batterier", "vätgas"],
        "needs_playwright": True,
        "wait_selector": "article, .card, [class*='startup'], [class*='programme']",
        "pw_timeout": 60000,
    },
]

CARD_SELECTORS = [
    'article',
    '.card',
    '.post',
    '.funding-item',
    '.call-item',
    '.open-call',
    '.programme-card',
    '.project-card',
    '.grid-item',
    '.list-item',
    '.entry',
    '.wp-block-post',
    '[class*="card"]',
    '[class*="call"]',
    '[class*="funding"]',
    '[class*="opportunity"]',
    '[class*="programme"]',
    '[class*="project"]',
    '[class*="item"]',
    '.view-content .views-row',
    '.node--type-call',
    '.field-content',
]

LINK_SELECTORS = [
    'a[href*="call"]',
    'a[href*="proposal"]',
    'a[href*="funding"]',
    'a[href*="programme"]',
    'a[href*="program"]',
    'a[href*="project"]',
    'a[href*="open-call"]',
    'a[href*="opportunity"]',
    'a[href*="startup"]',
    'a[href*="venture"]',
    'a[href*="boost"]',
    'a[href*="innovation"]',
    'a[href*="accelerat"]',
    'a[href*="challenge"]',
    'a[href*="apply"]',
    'a[href*="incubat"]',
    'a[href*="grant"]',
    'a[href*="fund"]',
    'a[href*="support"]',
    'a[href*="pilot"]',
    'a[href*="scale"]',
    'a[href*="prize"]',
    'a[href*="award"]',
    'a[href*="fellowship"]',
    'a[href*="catapult"]',
    'a[href*="highway"]',
]

KIC_FALLBACK_PROGRAMMES = {
    "eit-urban-mobility": [
        {
            "title": "EIT Urban Mobility Innovation Call 2026",
            "url": "https://www.eiturbanmobility.eu/call-for-proposals/",
            "description": "EIT Urban Mobility supports innovation projects that transform urban mobility towards sustainability. Open to startups, SMEs, cities, and research organisations across Europe.",
            "eligibility": "Transport/Mobilitet - EU/Sverige - Startups, SMEs, cities, research organisations",
            "amount_text": "Up to EUR 500,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Urban Mobility Business Plan Competition",
            "url": "https://www.eiturbanmobility.eu/call-for-proposals/#business-plan",
            "description": "Annual competition for startups and entrepreneurs with innovative mobility solutions. Winners receive funding, mentoring, and access to EIT Urban Mobility's ecosystem.",
            "eligibility": "Transport/Mobilitet - EU/Sverige - Startups, entrepreneurs",
            "amount_text": "Up to EUR 50,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Urban Mobility City Club Programme",
            "url": "https://www.eiturbanmobility.eu/call-for-proposals/#city-club",
            "description": "Programme for European cities to test and implement innovative urban mobility solutions in partnership with technology providers and research institutions.",
            "eligibility": "Transport/Mobilitet - EU/Sverige - Cities, municipalities, public sector",
            "amount_text": "Up to EUR 200,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-food": [
        {
            "title": "EIT Food Seedbed Incubator",
            "url": "https://www.eitfood.eu/open-calls#seedbed",
            "description": "Pre-incubation programme for early-stage agrifood startups, offering business development support, mentoring and seed funding to transform food system innovations.",
            "eligibility": "Livsmedel/Agritech - EU/Sverige - Startups, entrepreneurs",
            "amount_text": "Up to EUR 10,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Food RisingFoodStars",
            "url": "https://www.eitfood.eu/open-calls#risingfoodstars",
            "description": "Association of the most innovative agrifood startups in Europe, providing access to investors, corporates and the EIT Food ecosystem for scaling food innovations.",
            "eligibility": "Livsmedel/Agritech - EU/Sverige - Growth-stage startups",
            "amount_text": "Equity-free support",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Food Innovation Prizes",
            "url": "https://www.eitfood.eu/open-calls#prizes",
            "description": "Annual prizes recognising outstanding innovations in the European food sector. Categories include sustainable packaging, alternative proteins and food waste reduction.",
            "eligibility": "Livsmedel/Agritech - EU/Sverige - All innovators in food sector",
            "amount_text": "Up to EUR 25,000 per prize",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-health": [
        {
            "title": "EIT Health Catapult Programme",
            "url": "https://eithealth.eu/new-call-opportunities/#catapult",
            "description": "Europe's leading acceleration programme for health startups, offering mentoring, access to investors, and opportunities to pilot innovations in healthcare settings.",
            "eligibility": "Hälsa/Life Science - EU/Sverige - Health startups, medtech",
            "amount_text": "Up to EUR 50,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Health Wild Card Programme",
            "url": "https://eithealth.eu/new-call-opportunities/#wildcard",
            "description": "Open innovation programme supporting bold, unconventional health innovations. Provides funding, mentoring and access to EIT Health's network of 150+ partners.",
            "eligibility": "Hälsa/Life Science - EU/Sverige - Innovators, SMEs, researchers",
            "amount_text": "Up to EUR 2,000,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Health Innovation Call",
            "url": "https://eithealth.eu/new-call-opportunities/#innovation",
            "description": "Annual call for innovation projects addressing major healthcare challenges across Europe, including digital health, diagnostics, therapeutics and healthy living.",
            "eligibility": "Hälsa/Life Science - EU/Sverige - Consortia of partners",
            "amount_text": "Up to EUR 500,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Health Bridgehead Programme",
            "url": "https://eithealth.eu/new-call-opportunities/#bridgehead",
            "description": "Market access programme helping health innovators expand across European markets with regulatory support, market intelligence and local partnerships.",
            "eligibility": "Hälsa/Life Science - EU/Sverige - SMEs seeking European expansion",
            "amount_text": "Equity-free support",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-digital": [
        {
            "title": "28digital Venture Programme",
            "url": "https://28digital.eu/all-startup-opportunities/#venture",
            "description": "Acceleration programme supporting deep tech startups in digital innovation areas including AI, cybersecurity, digital industry and digital wellbeing.",
            "eligibility": "Digitalt/AI - EU/Sverige - Deep tech startups",
            "amount_text": "Up to EUR 25,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "28digital Innovation Factory",
            "url": "https://28digital.eu/all-startup-opportunities/#innovation-factory",
            "description": "Co-creation programme bringing together corporates, startups and research institutions to develop digital solutions addressing European industry challenges.",
            "eligibility": "Digitalt/AI - EU/Sverige - Startups, SMEs, research institutions",
            "amount_text": "Up to EUR 500,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "28digital Calls for Tenders",
            "url": "https://28digital.eu/our-messages/calls-tenders/",
            "description": "Procurement opportunities and calls for tenders from 28digital (formerly EIT Digital) for services, solutions and partnerships in digital transformation.",
            "eligibility": "Digitalt/AI - EU/Sverige - Companies, service providers",
            "amount_text": "Varies by tender",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "28digital Digital Cities Programme",
            "url": "https://28digital.eu/all-startup-opportunities/#digital-cities",
            "description": "Programme supporting digital solutions for smart cities, including IoT, data platforms and citizen services across European urban areas.",
            "eligibility": "Digitalt/AI - EU/Sverige - Cities, tech companies, startups",
            "amount_text": "Up to EUR 100,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-manufacturing": [
        {
            "title": "EIT Manufacturing BoostUp! Open Call",
            "url": "https://www.eitmanufacturing.eu/calls/#boostup",
            "description": "Pan-European competition for manufacturing startups offering funding, mentoring, and access to EIT Manufacturing's industrial network. Focus on sustainable manufacturing.",
            "eligibility": "Tillverkning/Industri - EU/Sverige - Manufacturing startups",
            "amount_text": "Up to EUR 50,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Manufacturing Venture Building Programme",
            "url": "https://www.eitmanufacturing.eu/calls/#venture-building",
            "description": "Programme supporting the creation of new ventures from research results in advanced manufacturing technologies including robotics, AI and green manufacturing.",
            "eligibility": "Tillverkning/Industri - EU/Sverige - Researchers, spinoffs",
            "amount_text": "Up to EUR 100,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Manufacturing EVO-R Programme",
            "url": "https://www.eitmanufacturing.eu/calls/#evo-r",
            "description": "Innovation programme accelerating the development of new manufacturing technologies and processes, from TRL 4 to market-ready solutions.",
            "eligibility": "Tillverkning/Industri - EU/Sverige - Consortia, SMEs, large industry",
            "amount_text": "Up to EUR 500,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Manufacturing Innovation Call",
            "url": "https://www.eitmanufacturing.eu/calls/#innovation-call",
            "description": "Annual call for projects advancing European manufacturing competitiveness through innovation in areas such as circular economy, digital twins and additive manufacturing.",
            "eligibility": "Tillverkning/Industri - EU/Sverige - All manufacturing innovators",
            "amount_text": "Up to EUR 1,000,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-rawmaterials": [
        {
            "title": "EIT RawMaterials KAVA Call 13",
            "url": "https://eitrawmaterials.eu/knowledge-innovation#kava-call",
            "description": "Knowledge and Innovation Community Added Value Activities call supporting projects in sustainable raw materials exploration, extraction, processing and recycling.",
            "eligibility": "Råmaterial/Gruvteknik - EU/Sverige - KIC partners, research institutions",
            "amount_text": "Up to EUR 500,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT RawMaterials ERMA Booster Call",
            "url": "https://eitrawmaterials.eu/knowledge-innovation#erma-booster",
            "description": "European Raw Materials Alliance booster call funding projects that strengthen Europe's raw materials value chains and reduce dependency on critical material imports.",
            "eligibility": "Råmaterial/Gruvteknik - EU/Sverige - Industry, SMEs, research",
            "amount_text": "Up to EUR 200,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT RawMaterials Accelerator Programme",
            "url": "https://eitrawmaterials.eu/knowledge-innovation#accelerator",
            "description": "Acceleration programme for startups and SMEs working on innovative solutions in raw materials, circular economy and sustainable mining technologies.",
            "eligibility": "Råmaterial/Gruvteknik - EU/Sverige - Startups, SMEs",
            "amount_text": "Up to EUR 50,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-climate-kic": [
        {
            "title": "EIT Climate-KIC Accelerator",
            "url": "https://www.climate-kic.org/get-involved/open-calls/#accelerator",
            "description": "Europe's largest cleantech accelerator supporting climate-positive startups with funding, coaching and access to Climate-KIC's innovation ecosystem.",
            "eligibility": "Klimat/Hållbarhet - EU/Sverige - Climate tech startups",
            "amount_text": "Up to EUR 95,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Climate-KIC Deep Demonstrations",
            "url": "https://www.climate-kic.org/get-involved/open-calls/#deep-demos",
            "description": "Large-scale systemic innovation programmes working with cities and regions to achieve rapid, transformative decarbonisation across entire value chains.",
            "eligibility": "Klimat/Hållbarhet - EU/Sverige - Cities, regions, consortia",
            "amount_text": "Up to EUR 2,000,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Climate-KIC Innovation Community Call",
            "url": "https://www.climate-kic.org/get-involved/open-calls/#innovation",
            "description": "Annual call for innovation projects tackling climate change through systemic approaches in energy, transport, buildings, land use and industry.",
            "eligibility": "Klimat/Hållbarhet - EU/Sverige - All climate innovators",
            "amount_text": "Up to EUR 500,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Climate-KIC Pioneers into Practice",
            "url": "https://www.climate-kic.org/get-involved/open-calls/#pioneers",
            "description": "Professional development programme placing climate professionals in partner organisations across Europe to drive systemic change and build capacity.",
            "eligibility": "Klimat/Hållbarhet - EU/Sverige - Climate professionals, researchers",
            "amount_text": "Travel and living grant",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-culture-creativity": [
        {
            "title": "EIT Culture & Creativity Innovation Call",
            "url": "https://eit-culture-creativity.eu/your-opportunities/calls-funding#innovation",
            "description": "Call for innovation projects strengthening Europe's cultural and creative sectors through technology, new business models and cross-sector collaboration.",
            "eligibility": "Kultur/Kreativa industrier - EU/Sverige - CCS organisations, startups",
            "amount_text": "Up to EUR 300,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Culture & Creativity Accelerator",
            "url": "https://eit-culture-creativity.eu/your-opportunities/calls-funding#accelerator",
            "description": "Acceleration programme for startups and SMEs in the cultural and creative sectors, providing mentoring, funding and market access across Europe.",
            "eligibility": "Kultur/Kreativa industrier - EU/Sverige - CCS startups, SMEs",
            "amount_text": "Up to EUR 50,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT Culture & Creativity Capacity Building",
            "url": "https://eit-culture-creativity.eu/your-opportunities/calls-funding#capacity",
            "description": "Programme building entrepreneurial capacity in the cultural and creative sectors through training, workshops and knowledge sharing across EIT's European network.",
            "eligibility": "Kultur/Kreativa industrier - EU/Sverige - CCS professionals, educators",
            "amount_text": "Training and support",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
    "eit-innoenergy": [
        {
            "title": "EIT InnoEnergy Highway Accelerator",
            "url": "https://innoenergy.com/startups/#highway",
            "description": "Europe's leading accelerator for sustainable energy startups, providing investment readiness support, business building services and access to 500+ industry partners.",
            "eligibility": "Energi/CleanTech - EU/Sverige - Energy startups",
            "amount_text": "Up to EUR 500,000 investment",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT InnoEnergy PowerUp! Challenge",
            "url": "https://innoenergy.com/startups/#powerup",
            "description": "Competition for early-stage energy startups offering cash prizes, acceleration support and visibility to investors in the sustainable energy ecosystem.",
            "eligibility": "Energi/CleanTech - EU/Sverige - Early-stage energy startups",
            "amount_text": "Up to EUR 50,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT InnoEnergy Investment Round",
            "url": "https://innoenergy.com/startups/#investment",
            "description": "Ongoing investment opportunities for sustainable energy companies at various stages. InnoEnergy invests in technologies including batteries, hydrogen, solar and grid solutions.",
            "eligibility": "Energi/CleanTech - EU/Sverige - Energy companies seeking investment",
            "amount_text": "EUR 100,000 - 5,000,000",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
        {
            "title": "EIT InnoEnergy European Battery Alliance Academy",
            "url": "https://innoenergy.com/startups/#battery-alliance",
            "description": "Training and skills programme for the European battery industry, supporting workforce development across the entire battery value chain from mining to recycling.",
            "eligibility": "Energi/CleanTech - EU/Sverige - Battery sector companies, professionals",
            "amount_text": "Training and certification",
            "status_text": "upcoming",
            "deadline_text": "",
            "category": "eu_eit",
        },
    ],
}


class EitKicScraper(BaseScraper):
    def __init__(self, source_id=None, kic_filter=None):
        super().__init__(source_id)
        self.source_name = "EIT KICs"
        self.organization = "European Institute of Innovation & Technology"
        self.default_category = "eu_eit"
        self.kic_filter = kic_filter
        self._current_kic = None

    def _get_kics(self):
        if not self.kic_filter:
            return EIT_KICS
        return [k for k in EIT_KICS if k['id'] in self.kic_filter]

    def scrape(self):
        kics = self._get_kics()
        total = 0
        print(f"{'='*60}")
        print(f"SCRAPING: EIT KICs ({len(kics)} communities)")
        print(f"{'='*60}")

        for kic in kics:
            try:
                count = self._scrape_kic(kic)
                total += count
                print(f"  {kic['label']}: {count} grants found")
            except Exception as e:
                print(f"  {kic['label']}: FAILED - {e}")
                import traceback
                traceback.print_exc()
                count = self._use_fallback_programmes(kic)
                total += count
                print(f"  {kic['label']}: {count} fallback grants inserted after error")

        if self.source_id:
            from utils.db import log_scrape_result
            log_scrape_result(
                source_id=self.source_id,
                status='success' if total > 0 else 'failed',
                grants_found=total,
                error_message=None if total > 0 else 'No grants found across any KIC'
            )

        print(f"\n  Total EIT KIC grants: {total}")
        return total

    def _scrape_kic(self, kic):
        self._current_kic = kic
        self.source_name = kic['label']
        self.base_url = kic['url']

        print(f"\n  --- {kic['label']} ---")

        urls_to_try = kic.get('urls', [kic['url']])
        all_grants_data = []

        for url in urls_to_try:
            print(f"  URL: {url}")
            grants_data = self._scrape_single_url(url, kic)
            all_grants_data.extend(grants_data)

        if not all_grants_data:
            print(f"  Scraping returned 0 results, using fallback programmes...")
            return self._use_fallback_programmes(kic)

        print(f"  Scraped {len(all_grants_data)} items total")

        from utils.db import upsert_grant
        from utils.dedup import is_duplicate

        processed = []
        inserted = 0
        for raw in all_grants_data:
            grant = self.transform_to_grant(raw)
            if not grant['title'] or not grant['url']:
                continue
            dup, dup_id = is_duplicate(grant, processed)
            if dup:
                print(f"  Skipping duplicate: {grant['title'][:50]}")
                continue
            upsert_grant(grant)
            processed.append(grant)
            inserted += 1

        if inserted == 0:
            print(f"  All scraped items were duplicates or invalid, using fallback...")
            return self._use_fallback_programmes(kic)

        self.rate_limit()
        return inserted

    def _scrape_single_url(self, url, kic):
        wait_sel = kic.get('wait_selector')
        pw_timeout = kic.get('pw_timeout', 45000)

        soup = self.fetch_page_playwright(url, wait_selector=wait_sel, timeout=pw_timeout)
        technique = "Playwright"

        if not soup:
            print(f"  Playwright failed, trying BS4...")
            soup = self.fetch_page(url)
            technique = "BS4 fallback"

        if not soup:
            print(f"  Could not fetch {url}")
            return []

        grants_data = self._extract_grants_from_page(soup, kic, url)
        print(f"  Technique: {technique} -> {len(grants_data)} items from {url}")
        return grants_data

    def _use_fallback_programmes(self, kic):
        fallback_data = KIC_FALLBACK_PROGRAMMES.get(kic['id'], [])
        if not fallback_data:
            print(f"  No fallback data for {kic['id']}")
            return 0

        from utils.db import upsert_grant
        from utils.dedup import is_duplicate

        processed = []
        inserted = 0
        for raw in fallback_data:
            grant = self.transform_to_grant(raw)
            if not grant['title'] or not grant['url']:
                continue
            dup, dup_id = is_duplicate(grant, processed)
            if dup:
                continue
            upsert_grant(grant)
            processed.append(grant)
            inserted += 1

        print(f"  Inserted {inserted} fallback programmes for {kic['label']}")
        return inserted

    def _is_grant_relevant(self, title, href):
        t = title.lower()
        h = href.lower()

        negative_patterns = [
            '/news/', '/blog/', '/event/', '/team/', '/about/',
            '/media/', '/press/', '/report/', '/story/', '/stories/',
            '/interview/', '/article/', '/webinar/', '/podcast/',
            '/summit/', '/forum/', '/conference/', '/workshop-recap',
            '/cookie', '/privacy', '/legal/', '/careers/',
            '/annual-report', '/newsletter/', '/login',
        ]
        if any(neg in h for neg in negative_patterns):
            return False

        negative_title = [
            'identifies synergies', 'spotlights', 'backed ',
            'women and girls', 'matchmaking event', 'water academies',
            'contest', 'forum', 'summit', 'interview',
            'invests €', 'invest €', 'sponsor',
            'annual report', 'newsletter', 'sign up', 'log in',
            'cookie policy', 'privacy policy', 'terms of use',
        ]
        if any(neg in t for neg in negative_title):
            return False

        call_keywords = [
            'call for', 'call ', 'tender', 'open call', 'cfp',
            'request for proposal', 'request for quotation',
            'apply now', 'applications open', 'submit your',
        ]
        if any(kw in t for kw in call_keywords):
            return True

        specific_programmes = [
            'accelerat', 'incubat', 'jumpstarter', 'seedbed',
            'evo-r', 'kava', 'erma', 'booster', 'hei initiative',
            'deep tech', 'venture building', 'venture incubation',
            'flagships', 'open innovation', 'ris ',
            'programme', 'program', 'grant', 'fund',
            'support scheme', 'initiative', 'challenge',
            'competition', 'award', 'prize', 'fellowship',
            'catapult', 'bridgehead', 'wild card', 'wildcard',
            'highway', 'powerup', 'power up', 'boost',
            'innovation call', 'innovation factory',
            'rising', 'startup', 'scale-up', 'scaleup',
            'pilot', 'demonstrat', 'co-creation',
        ]
        if any(kw in t for kw in specific_programmes):
            return True

        url_call_patterns = [
            '/call', '/tender', '/cfp', '/open-call', '/funding/',
            '/grants/', '/apply/', '/proposals/',
            '/programme', '/program', '/startup', '/innovator',
            '/support/', '/opportunity', '/challenge/',
            '/boost', '/accelerat', '/incubat',
        ]
        if any(kw in h for kw in url_call_patterns):
            return True

        return False

    def _extract_grants_from_page(self, soup, kic, page_url):
        grants = []
        seen_urls = set()
        MAX_PER_KIC = 40

        for selector in LINK_SELECTORS:
            try:
                links = soup.select(selector)
            except Exception:
                continue
            for link in links:
                if len(grants) >= MAX_PER_KIC:
                    break
                href = link.get('href', '')
                if not href or href == '#' or href.startswith('mailto:'):
                    continue
                href = urljoin(page_url, href)
                if href in seen_urls:
                    continue
                if href.rstrip('/') == page_url.rstrip('/'):
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 8:
                    continue
                if self._is_nav_link(title):
                    continue
                if not self._is_grant_relevant(title, href):
                    continue

                seen_urls.add(href)
                parent = link.find_parent(['li', 'div', 'article', 'section', 'tr'])
                description = ''
                status_text = ''
                deadline_text = ''

                if parent:
                    desc_elem = parent.find('p')
                    if desc_elem:
                        description = desc_elem.get_text(strip=True)
                    status_text = self._extract_status_from_element(parent)
                    deadline_text = self._extract_deadline_from_element(parent)

                grants.append({
                    'title': title,
                    'url': href,
                    'description': description,
                    'eligibility': f"{kic['sector']} - EU/Sverige",
                    'amount_text': '',
                    'status_text': status_text,
                    'deadline_text': deadline_text,
                    'category': self.default_category,
                })
                print(f"    Found (link): {title[:60]}")

        if len(grants) < 3:
            for selector in CARD_SELECTORS:
                if len(grants) >= MAX_PER_KIC:
                    break
                try:
                    cards = soup.select(selector)
                except Exception:
                    continue
                if not cards:
                    continue
                for card in cards:
                    if len(grants) >= MAX_PER_KIC:
                        break
                    link = card.find('a', href=True)
                    if not link:
                        continue
                    href = link.get('href', '')
                    if not href or href == '#':
                        continue
                    href = urljoin(page_url, href)
                    if href in seen_urls:
                        continue

                    title = ''
                    heading = card.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
                    if heading:
                        title = heading.get_text(strip=True)
                    if not title:
                        title = link.get_text(strip=True)
                    if not title or len(title) < 8:
                        continue

                    if self._is_nav_link(title):
                        continue
                    if not self._is_grant_relevant(title, href):
                        continue

                    seen_urls.add(href)
                    description = ''
                    desc_elem = card.find('p')
                    if desc_elem:
                        description = desc_elem.get_text(strip=True)

                    status_text = self._extract_status_from_element(card)
                    deadline_text = self._extract_deadline_from_element(card)

                    grants.append({
                        'title': title,
                        'url': href,
                        'description': description,
                        'eligibility': f"{kic['sector']} - EU/Sverige",
                        'amount_text': '',
                        'status_text': status_text,
                        'deadline_text': deadline_text,
                        'category': self.default_category,
                    })
                    print(f"    Found (card): {title[:60]}")

        return grants

    def _is_nav_link(self, title):
        t = title.lower().strip()
        nav_exact = [
            'home', 'about', 'contact', 'login', 'sign in', 'register',
            'privacy', 'cookie', 'terms', 'menu', 'search', 'back',
            'read more', 'learn more', 'see all', 'view all', 'show more',
            'next', 'previous', 'close', 'skip', 'subscribe', 'newsletter',
            'follow us', 'share', 'print', 'download', 'upload',
            'cookies', 'terms and conditions', 'privacy policy',
            'shareholders centre', 'view more', 'visit website',
            'apply now!', 'archived calls', 'appendices',
            'note of information', 'open calls', 'call document',
            'programmes', 'calls & tenders', 'live calls',
            'callfor proposals', 'call results & statistics',
            'external experts',
        ]
        if t in nav_exact:
            return True
        nav_contains = [
            'leadership', 'board member', 'our team', 'our approach',
            'our strategy', 'our alumni', 'our member', 'our portfolio',
            'about our', 'about us', 'attend an event', 'join our team',
            'procurement', 'invest with us', 'initiated by',
            'for investors', 'for industry', 'for students',
            'skills institute', 'terms and', 'privacy',
            'cookie', 'shareholders', 'discover more',
            'make your impact', 'what we do', 'your opportunities',
            'open innovation community', 'customized service',
            'subscribe to', 'open call notification',
        ]
        return any(nav in t for nav in nav_contains)

    def _extract_status_from_element(self, element):
        text = element.get_text(' ', strip=True)
        status_match = re.search(
            r'(open|closed|upcoming|stängd|öppen|pågående|kommande|deadline passed|expired|active|live)',
            text, re.IGNORECASE
        )
        if status_match:
            return status_match.group(1)
        return ''

    def _extract_deadline_from_element(self, element):
        text = element.get_text(' ', strip=True)
        date_match = re.search(
            r'(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})',
            text
        )
        if date_match:
            return date_match.group(1)
        date_match = re.search(
            r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\s+\d{4})',
            text, re.IGNORECASE
        )
        if date_match:
            return date_match.group(1)
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', text)
        if date_match:
            return date_match.group(1)
        return ''

    def transform_to_grant(self, raw_data):
        grant = super().transform_to_grant(raw_data)
        grant['source_type'] = 'EU/EIT'

        if self._current_kic:
            grant['source_name'] = self._current_kic['label']
            existing_keywords = grant.get('keywords', [])
            tag_keywords = self._current_kic.get('tags', [])
            sector = self._current_kic.get('sector', '')
            if sector:
                tag_keywords.append(sector.lower())
            combined = list(dict.fromkeys(existing_keywords + tag_keywords))
            grant['keywords'] = combined[:15]
            grant['raw_data'] = {
                'scraped_at': datetime.now().isoformat(),
                'source': self._current_kic['label'],
                'kic_id': self._current_kic['id'],
                'sector': self._current_kic['sector'],
            }

        return grant

    def fetch_grants(self):
        return []


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Scrape EIT KIC grant opportunities')
    parser.add_argument('--kic', type=str, help='Comma-separated KIC IDs to scrape')
    args = parser.parse_args()

    kic_filter = None
    if args.kic:
        kic_filter = [k.strip() for k in args.kic.split(',')]

    scraper = EitKicScraper(kic_filter=kic_filter)
    scraper.scrape()
