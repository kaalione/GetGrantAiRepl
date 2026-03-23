#!/usr/bin/env python3
"""
getgrant.ai Scraper Scheduler

Runs scrapers based on their configured update frequency.
Daily scrapers run at 08:00, weekly scrapers run on Mondays at 08:00.

Usage:
    python scheduler.py             # Run the scheduler daemon
    python scheduler.py --once      # Run once and exit (for cron)
"""

import argparse
import sys
import os
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import schedule
except ImportError:
    print("Error: schedule library not installed. Run: pip install schedule")
    sys.exit(1)

from main import run_scrapers_by_frequency, run_all_scrapers


def run_daily_scrapers():
    """Run all scrapers with daily update frequency."""
    print(f"\n[{datetime.now()}] Starting daily scraper run...")
    try:
        result = run_scrapers_by_frequency('daily')
        print(f"Daily scrapers completed: {result.get('total_grants', 0)} grants found")
    except Exception as e:
        print(f"Error running daily scrapers: {e}")


def run_weekly_scrapers():
    """Run all scrapers with weekly update frequency."""
    print(f"\n[{datetime.now()}] Starting weekly scraper run...")
    try:
        result = run_scrapers_by_frequency('weekly')
        print(f"Weekly scrapers completed: {result.get('total_grants', 0)} grants found")
    except Exception as e:
        print(f"Error running weekly scrapers: {e}")


def run_all():
    """Run all active scrapers regardless of frequency."""
    print(f"\n[{datetime.now()}] Starting full scraper run...")
    try:
        result = run_all_scrapers()
        print(f"All scrapers completed: {result.get('total_grants', 0)} grants found")
    except Exception as e:
        print(f"Error running scrapers: {e}")


def setup_schedule():
    """Set up the scraper schedule."""
    schedule.every().day.at("08:00").do(run_daily_scrapers)
    
    schedule.every().monday.at("08:00").do(run_weekly_scrapers)
    
    print("Scheduler configured:")
    print("  - Daily scrapers: Every day at 08:00")
    print("  - Weekly scrapers: Every Monday at 08:00")
    print("\nPending jobs:")
    for job in schedule.get_jobs():
        print(f"  - {job}")


def run_scheduler_daemon():
    """Run the scheduler as a daemon process."""
    print(f"\n{'='*60}")
    print("getgrant.ai Scraper Scheduler")
    print(f"Started at: {datetime.now().isoformat()}")
    print(f"{'='*60}")
    
    setup_schedule()
    
    print("\nScheduler running... (Press Ctrl+C to stop)")
    
    try:
        while True:
            schedule.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\nScheduler stopped.")


def main():
    parser = argparse.ArgumentParser(
        description='getgrant.ai Scraper Scheduler',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run all scrapers once and exit (for cron jobs)'
    )
    
    parser.add_argument(
        '--daily',
        action='store_true',
        help='Run daily scrapers once and exit'
    )
    
    parser.add_argument(
        '--weekly',
        action='store_true',
        help='Run weekly scrapers once and exit'
    )
    
    args = parser.parse_args()
    
    if args.once:
        run_all()
    elif args.daily:
        run_daily_scrapers()
    elif args.weekly:
        run_weekly_scrapers()
    else:
        run_scheduler_daemon()


if __name__ == '__main__':
    main()
