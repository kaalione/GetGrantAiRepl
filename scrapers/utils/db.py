import os
import json
import time
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from datetime import datetime
from typing import Optional, List, Dict, Any

# Load DATABASE_URL from the repo-root .env when running outside a
# pre-configured environment (local dev, cron).
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.env'))
except ImportError:
    pass

# A scrape can run for minutes and opens a connection per write, so a momentary
# network blip should not discard work already done. One such blip — "Network is
# unreachable" against the Supabase pooler — cost a whole agency's run, and the
# same connection succeeded seconds later.
CONNECT_ATTEMPTS = 4
CONNECT_BACKOFF_SECONDS = 1.5


def get_connection():
    """Get a connection to the PostgreSQL database, retrying transient failures."""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is not set")

    last_error = None
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            return psycopg2.connect(database_url, connect_timeout=15)
        except psycopg2.OperationalError as error:
            # Authentication and configuration errors will not fix themselves.
            message = str(error).lower()
            if 'password' in message or 'does not exist' in message:
                raise
            last_error = error
            if attempt < CONNECT_ATTEMPTS:
                delay = CONNECT_BACKOFF_SECONDS * attempt
                print(f"  DB connect failed ({str(error).strip()[:60]}) — retrying in {delay:.0f}s")
                time.sleep(delay)

    raise last_error

def get_active_sources() -> List[Dict[str, Any]]:
    """Fetch all active scraper sources from the database."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, name, type, url, scraper_type, selectors, 
                       active, last_scraped, update_frequency, api_config
                FROM scraper_sources 
                WHERE active = true
            """)
            sources = cur.fetchall()
            return [dict(row) for row in sources]
    finally:
        conn.close()

def get_source_by_id(source_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a specific scraper source by ID."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, name, type, url, scraper_type, selectors, 
                       active, last_scraped, update_frequency, api_config
                FROM scraper_sources 
                WHERE id = %s
            """, (source_id,))
            source = cur.fetchone()
            return dict(source) if source else None
    finally:
        conn.close()

def upsert_grant(grant_data: Dict[str, Any]) -> str:
    """Insert or update a grant in the database. Returns the grant ID.
    
    Uses URL as a logical unique identifier - checks for existing record
    and updates if found, otherwise inserts.
    """
    conn = get_connection()
    try:
        prepared_data = grant_data.copy()
        # Keywords must describe the individual grant, not its source —
        # keep only scraper keywords grounded in the grant's own text and
        # add lexicon extractions from title/description (see utils/keywords).
        from utils.keywords import refine_keywords
        prepared_data['keywords'] = refine_keywords(
            prepared_data.get('title'),
            prepared_data.get('description'),
            prepared_data.get('keywords'),
        )
        for field in ['eligibility_criteria', 'application_requirements', 'raw_data']:
            val = prepared_data.get(field)
            if val is None or val == '' or val == {} or val == []:
                prepared_data[field] = None
            elif isinstance(val, (dict, list)):
                prepared_data[field] = Json(val)
            elif isinstance(val, str):
                prepared_data[field] = Json({'text': val})
        
        with conn.cursor() as cur:
            # Check if grant with this URL already exists
            cur.execute("SELECT id FROM grants WHERE url = %s", (prepared_data.get('url'),))
            existing = cur.fetchone()
            
            market = prepared_data.pop('market', None)
            language = prepared_data.pop('language', None)

            market_sql_update = ""
            market_sql_cols = ""
            market_sql_vals = ""
            if market:
                prepared_data['market'] = market
                market_sql_update += ", market = %(market)s"
            if language:
                prepared_data['language'] = language
                market_sql_update += ", language = %(language)s"

            if existing:
                cur.execute("""
                    UPDATE grants SET
                        title = %(title)s,
                        description = %(description)s,
                        source_name = %(source_name)s,
                        source_type = %(source_type)s,
                        deadline = %(deadline)s,
                        amount_min = %(amount_min)s,
                        amount_max = %(amount_max)s,
                        eligibility_criteria = %(eligibility_criteria)s,
                        target_group = %(target_group)s,
                        keywords = %(keywords)s,
                        application_requirements = %(application_requirements)s,
                        status = %(status)s,
                        raw_data = %(raw_data)s,
                        updated_at = NOW()""" + market_sql_update + """
                    WHERE url = %(url)s
                    RETURNING id
                """, prepared_data)
            else:
                cols = [
                    'title', 'description', 'source_name', 'source_type', 'url',
                    'deadline', 'amount_min', 'amount_max', 'eligibility_criteria',
                    'target_group', 'keywords', 'application_requirements',
                    'status', 'raw_data'
                ]
                if market:
                    cols.append('market')
                if language:
                    cols.append('language')
                col_names = ', '.join(cols) + ', updated_at'
                col_vals = ', '.join(f'%({c})s' for c in cols) + ', NOW()'
                cur.execute(f"""
                    INSERT INTO grants ({col_names})
                    VALUES ({col_vals})
                    RETURNING id
                """, prepared_data)
            
            result = cur.fetchone()
            conn.commit()
            return result[0] if result else None
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def log_scrape_result(
    source_id: str,
    status: str,
    grants_found: Optional[int] = None,
    error_message: Optional[str] = None
) -> str:
    """Log a scraping result to the database."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO scraper_logs (source_id, status, grants_found, error_message, scraped_at)
                VALUES (%s, %s, %s, %s, NOW())
                RETURNING id
            """, (source_id, status, grants_found, error_message))
            log_id = cur.fetchone()[0]
            
            cur.execute("""
                UPDATE scraper_sources SET last_scraped = NOW() WHERE id = %s
            """, (source_id,))
            
            conn.commit()
            return log_id
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_grant_urls_by_source(source_name: str) -> set:
    """Get all grant URLs for a given source name."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT url FROM grants WHERE source_name = %s",
                (source_name,)
            )
            return {row[0] for row in cur.fetchall()}
    finally:
        conn.close()


def get_sources_by_frequency(frequency: str) -> List[Dict[str, Any]]:
    """Fetch active sources by update frequency (daily/weekly)."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, name, type, url, scraper_type, selectors, 
                       active, last_scraped, update_frequency, api_config
                FROM scraper_sources 
                WHERE active = true AND update_frequency = %s
            """, (frequency,))
            sources = cur.fetchall()
            return [dict(row) for row in sources]
    finally:
        conn.close()
