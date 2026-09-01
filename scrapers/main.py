#!/usr/bin/env python3
"""
getgrant.ai Scraper Service - Main Entry Point

Usage:
    python main.py                     # Run all active scrapers
    python main.py --source-id <id>    # Run a specific scraper
    python main.py --frequency daily   # Run all daily scrapers
    python main.py --frequency weekly  # Run all weekly scrapers
"""

import argparse
import sys
import os
from typing import Optional
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.db import get_active_sources, get_source_by_id, get_sources_by_frequency
from sources.generic_scraper import GenericScraper
from sources.vinnova import VinnovaScraper
from sources.tillvaxtverket import TillvaxtverketScraper
from sources.vinnova_api import VinnovaApiClient


class VinnovaApiScraper:
    """Wrapper to make VinnovaApiClient compatible with scraper interface."""

    def __init__(self, source):
        self.source = source
        self.client = VinnovaApiClient()

    def scrape(self) -> int:
        return self.client.scrape(source_id=self.source['id'])


def get_scraper_for_source(source):
    """Get the appropriate scraper class for a source based on its name and type."""
    name_lower = source['name'].lower()
    source_type = source.get('type', '').lower()

    # Config-driven sources declare what they are, so adding one of these is a
    # database row rather than another file in this dispatch chain.
    config = source.get('selectors') or {}
    if config.get('kind') == 'regional_stod':
        from sources.regional_stod import RegionalStodScraper
        return RegionalStodScraper(source)
    if config.get('kind') == 'gdp_api':
        from sources.gdp_api import GdpApiScraper
        return GdpApiScraper(source)

    if 'vinnova' in name_lower:
        if source_type == 'api' or 'api' in name_lower:
            return VinnovaApiScraper(source)
        else:
            return VinnovaScraper(source)
    elif 'tillväxtverket' in name_lower or 'tillvaxtverket' in name_lower:
        return TillvaxtverketScraper(source)
    elif 'energimyndigheten' in name_lower:
        from sources.energimyndigheten import EnergimyndighetenScraper
        scraper = EnergimyndighetenScraper(source_id=source['id'])
        return scraper
    elif 'almi' in name_lower:
        from sources.almi import AlmiScraper
        scraper = AlmiScraper(source_id=source['id'])
        return scraper
    elif 'naturvårdsverket' in name_lower or 'naturvardsverket' in name_lower or 'klimatklivet' in name_lower:
        from sources.naturvardsverket import NaturvardsverketScraper
        scraper = NaturvardsverketScraper(source_id=source['id'])
        return scraper
    elif 'formas' in name_lower:
        from sources.formas import FormasScraper
        scraper = FormasScraper(source_id=source['id'])
        return scraper
    elif 'jordbruksverket' in name_lower:
        from sources.jordbruksverket import JordbruksverketScraper
        scraper = JordbruksverketScraper(source_id=source['id'])
        return scraper
    elif 'boverket' in name_lower:
        from sources.boverket import BoverketScraper
        scraper = BoverketScraper(source_id=source['id'])
        return scraper
    elif 'kulturrådet' in name_lower or 'kulturradet' in name_lower:
        from sources.kulturradet import KulturradetScraper
        scraper = KulturradetScraper(source_id=source['id'])
        return scraper
    elif 'konstnärsnämnden' in name_lower or 'konstnarsnamnden' in name_lower:
        from sources.konstnarsnamnden import KonstnarsnamndenScraper
        scraper = KonstnarsnamndenScraper(source_id=source['id'])
        return scraper
    elif name_lower.startswith('ekn') or 'exportkreditnämnden' in name_lower or 'exportkreditnamnden' in name_lower:
        from sources.ekn import EknScraper
        scraper = EknScraper(source_id=source['id'])
        return scraper
    elif 'region stockholm' in name_lower:
        from sources.region_stockholm import RegionStockholmScraper
        scraper = RegionStockholmScraper(source_id=source['id'])
        return scraper
    elif 'västra götaland' in name_lower or 'vgr' in name_lower:
        from sources.region_vgr import RegionVGRScraper
        scraper = RegionVGRScraper(source_id=source['id'])
        return scraper
    elif 'region skåne' in name_lower or 'skane' in name_lower or 'skåne' in name_lower:
        from sources.region_skane import RegionSkaneScraper
        scraper = RegionSkaneScraper(source_id=source['id'])
        return scraper
    elif 'kk-stiftelsen' in name_lower or 'kk stiftelsen' in name_lower:
        from sources.kk_stiftelsen import KKStiftelsenScraper
        scraper = KKStiftelsenScraper(source_id=source['id'])
        return scraper
    elif 'internetstiftelsen' in name_lower:
        from sources.internetstiftelsen import InternetstiftelsenScraper
        scraper = InternetstiftelsenScraper(source_id=source['id'])
        return scraper
    elif 'postkodstiftelsen' in name_lower:
        from sources.postkodstiftelsen import PostkodstiftelsenScraper
        scraper = PostkodstiftelsenScraper(source_id=source['id'])
        return scraper
    elif 'eu funding' in name_lower or 'eu-funding' in name_lower or 'sedia' in name_lower:
        from sources.eu_funding import EUFundingScraper
        scraper = EUFundingScraper(source_id=source['id'])
        return scraper
    elif 'verksamt' in name_lower:
        from sources.verksamt import VerksamtScraper
        scraper = VerksamtScraper(source_id=source['id'])
        return scraper
    elif 'länsstyrelse' in name_lower or 'lansstyrelse' in name_lower:
        from sources.lansstyrelse import LansstyrelseScraper
        scraper = LansstyrelseScraper(source_id=source['id'])
        return scraper
    elif 'eufonder' in name_lower:
        from sources.eufonder import EuFonderScraper
        scraper = EuFonderScraper(source_id=source['id'])
        return scraper
    elif 'forte' in name_lower:
        from sources.forte import ForteScraper
        scraper = ForteScraper(source_id=source['id'])
        return scraper
    elif 'interreg' in name_lower and 'öks' in name_lower:
        from sources.interreg_oks import InterregOKSScraper
        scraper = InterregOKSScraper(source_id=source['id'])
        return scraper
    elif 'interreg' in name_lower and 'central baltic' in name_lower:
        from sources.interreg_central_baltic import InterregCentralBalticScraper
        scraper = InterregCentralBalticScraper(source_id=source['id'])
        return scraper
    elif 'interreg' in name_lower and 'aurora' in name_lower:
        from sources.interreg_aurora import InterregAuroraScraper
        scraper = InterregAuroraScraper(source_id=source['id'])
        return scraper
    elif 'interreg' in name_lower and 'north sea' in name_lower:
        from sources.interreg_north_sea import InterregNorthSeaScraper
        scraper = InterregNorthSeaScraper(source_id=source['id'])
        return scraper
    elif 'interreg' in name_lower and 'baltic sea' in name_lower:
        from sources.interreg_baltic_sea import InterregBalticSeaScraper
        scraper = InterregBalticSeaScraper(source_id=source['id'])
        return scraper
    elif 'eit' in name_lower and any(k in name_lower for k in ['urban', 'manufacturing', 'food', 'health', 'digital', 'rawmaterial', 'climate', 'culture', 'innoenergy', 'kic']):
        from sources.eit_kics import EitKicScraper
        kic_id = None
        kic_map = {
            'urban': 'eit-urban-mobility', 'manufacturing': 'eit-manufacturing',
            'food': 'eit-food', 'health': 'eit-health', 'digital': 'eit-digital',
            'rawmaterial': 'eit-rawmaterials', 'climate': 'eit-climate-kic',
            'culture': 'eit-culture-creativity', 'innoenergy': 'eit-innoenergy',
        }
        for key, kid in kic_map.items():
            if key in name_lower:
                kic_id = kid
                break
        scraper = EitKicScraper(source_id=source['id'], kic_filter=[kic_id] if kic_id else None)
        return scraper
    elif 'cassini' in name_lower or 'euspa' in name_lower:
        from sources.cassini import CassiniScraper
        scraper = CassiniScraper(source_id=source['id'])
        return scraper
    elif 'ihi' in name_lower or 'innovative health' in name_lower:
        from sources.ihi import IhiScraper
        scraper = IhiScraper(source_id=source['id'])
        return scraper
    elif 'nordic innovation' in name_lower or 'nordforsk' in name_lower:
        from sources.nordic_innovation import NordicInnovationScraper
        scraper = NordicInnovationScraper(source_id=source['id'])
        return scraper
    elif 'cost' in name_lower and ('action' in name_lower or 'cost actions' in name_lower):
        from sources.cost_actions import CostActionsScraper
        scraper = CostActionsScraper(source_id=source['id'])
        return scraper
    elif 'nlnet' in name_lower or 'ngi zero' in name_lower or 'ngi' in name_lower:
        from sources.nlnet import NlnetScraper
        scraper = NlnetScraper(source_id=source['id'])
        return scraper
    elif 'nato' in name_lower and 'sps' in name_lower:
        from sources.nato_sps import NatoSpsScraper
        scraper = NatoSpsScraper(source_id=source['id'])
        return scraper
    elif 'edf' in name_lower or 'european defence fund' in name_lower:
        from sources.edf import EdfScraper
        scraper = EdfScraper(source_id=source['id'])
        return scraper
    elif 'forskningsrådet' in name_lower or 'forskningsradet' in name_lower:
        from sources.forskningsradet import ForskningsradetScraper
        scraper = ForskningsradetScraper(source_id=source['id'])
        return scraper
    elif 'innovasjon norge' in name_lower:
        from sources.innovasjon_norge import InnovasjonNorgeScraper
        scraper = InnovasjonNorgeScraper(source_id=source['id'])
        return scraper
    elif 'enova' in name_lower:
        from sources.enova import EnovaScraper
        scraper = EnovaScraper(source_id=source['id'])
        return scraper
    elif 'skattefunn' in name_lower:
        from sources.skattefunn import SkatteFUNNScraper
        scraper = SkatteFUNNScraper(source_id=source['id'])
        return scraper
    elif 'regionalforvaltning' in name_lower:
        from sources.regionalforvaltning_no import RegionalforvaltningNoScraper
        scraper = RegionalforvaltningNoScraper(source_id=source['id'])
        return scraper
    elif 'nordforsk' in name_lower:
        from sources.nordforsk import NordForskScraper
        scraper = NordForskScraper(source_id=source['id'])
        return scraper
    elif 'business finland' in name_lower:
        from sources.business_finland import BusinessFinlandScraper
        scraper = BusinessFinlandScraper(source_id=source['id'])
        return scraper
    elif 'ely' in name_lower and ('keskus' in name_lower or 'finland' in name_lower):
        from sources.ely_finland import ElyFinlandScraper
        scraper = ElyFinlandScraper(source_id=source['id'])
        return scraper
    elif 'starttiraha' in name_lower:
        from sources.starttiraha import StarttirahaScraper
        scraper = StarttirahaScraper(source_id=source['id'])
        return scraper
    elif 'suomi.fi' in name_lower or 'suomi fi' in name_lower:
        from sources.suomi_fi import SuomiFiScraper
        scraper = SuomiFiScraper(source_id=source['id'])
        return scraper
    elif 'ruokavirasto' in name_lower:
        from sources.ruokavirasto import RuokavirastoScraper
        scraper = RuokavirastoScraper(source_id=source['id'])
        return scraper
    elif 'finnpartnership' in name_lower:
        from sources.finnpartnership import FinnpartnershipScraper
        scraper = FinnpartnershipScraper(source_id=source['id'])
        return scraper
    else:
        return GenericScraper(source)


def run_single_scraper(source_id: str) -> dict:
    """Run a single scraper by source ID."""
    print(f"\n{'='*60}")
    print(f"Running scraper for source ID: {source_id}")
    print(f"Started at: {datetime.now().isoformat()}")
    print(f"{'='*60}")

    source = get_source_by_id(source_id)

    if not source:
        error_msg = f"Source with ID {source_id} not found"
        print(f"Error: {error_msg}")
        return {'success': False, 'error': error_msg, 'grants_found': 0}

    print(f"Source: {source['name']} ({source['type']})")
    print(f"URL: {source['url']}")

    try:
        scraper = get_scraper_for_source(source)
        grants_found = scraper.scrape()

        result = {
            'success': True,
            'source_id': source_id,
            'source_name': source['name'],
            'grants_found': grants_found,
            'timestamp': datetime.now().isoformat()
        }

        print(f"\nCompleted: {grants_found} grants found")
        return result

    except Exception as e:
        error_msg = str(e)
        print(f"\nFailed: {error_msg}")
        return {
            'success': False,
            'source_id': source_id,
            'source_name': source['name'],
            'error': error_msg,
            'grants_found': 0,
            'timestamp': datetime.now().isoformat()
        }


def run_all_scrapers() -> dict:
    """Run all active scrapers."""
    print(f"\n{'='*60}")
    print("Running all active scrapers")
    print(f"Started at: {datetime.now().isoformat()}")
    print(f"{'='*60}")

    sources = get_active_sources()

    if not sources:
        print("No active sources found")
        return {'success': True, 'total_sources': 0, 'total_grants': 0, 'results': []}

    print(f"Found {len(sources)} active sources")

    results = []
    total_grants = 0
    success_count = 0

    for source in sources:
        print(f"\n--- Processing: {source['name']} ---")
        result = run_single_scraper(source['id'])
        results.append(result)

        if result['success']:
            success_count += 1
            total_grants += result.get('grants_found', 0)

    summary = {
        'success': True,
        'total_sources': len(sources),
        'successful_sources': success_count,
        'failed_sources': len(sources) - success_count,
        'total_grants': total_grants,
        'results': results,
        'timestamp': datetime.now().isoformat()
    }

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Total sources: {len(sources)}")
    print(f"Successful: {success_count}")
    print(f"Failed: {len(sources) - success_count}")
    print(f"Total grants found: {total_grants}")

    return summary


def run_scrapers_by_frequency(frequency: str) -> dict:
    """Run all scrapers with a specific update frequency."""
    print(f"\n{'='*60}")
    print(f"Running {frequency} scrapers")
    print(f"Started at: {datetime.now().isoformat()}")
    print(f"{'='*60}")

    sources = get_sources_by_frequency(frequency)

    if not sources:
        print(f"No {frequency} sources found")
        return {'success': True, 'total_sources': 0, 'total_grants': 0, 'results': []}

    print(f"Found {len(sources)} {frequency} sources")

    results = []
    total_grants = 0
    success_count = 0

    for source in sources:
        print(f"\n--- Processing: {source['name']} ---")
        result = run_single_scraper(source['id'])
        results.append(result)

        if result['success']:
            success_count += 1
            total_grants += result.get('grants_found', 0)

    return {
        'success': True,
        'frequency': frequency,
        'total_sources': len(sources),
        'successful_sources': success_count,
        'failed_sources': len(sources) - success_count,
        'total_grants': total_grants,
        'results': results,
        'timestamp': datetime.now().isoformat()
    }


def main():
    parser = argparse.ArgumentParser(
        description='getgrant.ai Scraper Service',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python main.py                      Run all active scrapers
    python main.py --source-id abc123   Run specific scraper
    python main.py --frequency daily    Run all daily scrapers
    python main.py --frequency weekly   Run all weekly scrapers
        """
    )

    parser.add_argument(
        '--source-id',
        type=str,
        help='ID of a specific source to scrape'
    )

    parser.add_argument(
        '--frequency',
        type=str,
        choices=['daily', 'weekly'],
        help='Run scrapers with this update frequency'
    )

    args = parser.parse_args()

    try:
        if args.source_id:
            result = run_single_scraper(args.source_id)
        elif args.frequency:
            result = run_scrapers_by_frequency(args.frequency)
        else:
            result = run_all_scrapers()

        if result.get('success'):
            print("\nScraping completed successfully!")
            sys.exit(0)
        else:
            error_msg = result.get('error', 'Unknown error')
            print(f"\nScraping completed with errors: {error_msg}", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"\nFatal error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
