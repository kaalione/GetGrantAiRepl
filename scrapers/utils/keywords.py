"""Per-grant keyword extraction.

Scrapers historically stamped the same source-level keyword list on every
grant from a source (all EIT Digital grants got ["digitalt", "AI", ...]),
which made grants from one source indistinguishable to the matching engine.
This module derives keywords from each grant's OWN title/description text:

- extract_grant_keywords(): matches a multilingual (sv/no/fi/en) trigger
  lexicon against the grant text and emits canonical Swedish keywords that
  the matching engine's INDUSTRY_SYNONYMS vocabulary can hit.
- refine_keywords(): combines lexicon extraction with the scraper-provided
  keywords, but only keeps scraper keywords that actually occur in the
  grant's own text. Compound entries ("digitalt/ai") are split and deduped.

Canonical keywords are Swedish because client/src/lib/matching.ts expands
company industries to a mixed Swedish/English synonym vocabulary — the
Swedish canonical form is matchable for all markets.
"""

import re
import unicodedata


def _normalize(text):
    """Lowercase and strip diacritics (å→a, ä→a, ö→o); ø/æ are kept as-is."""
    text = unicodedata.normalize('NFD', text or '')
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower()


# canonical keyword -> (substring_triggers, word_triggers)
# Substring triggers match anywhere in the normalized text; word triggers
# require word boundaries (for short/ambiguous terms like "ai", "it", "film").
# Triggers are written pre-normalized (no diacritics, lowercase).
LEXICON = [
    # Digitalt / tech
    ("digitalisering", ["digitalisering", "digitalization", "digitalisation", "digitalisaatio", "digitaliser"], ["digital", "digitalt", "digitale"]),
    ("ai", ["artificiell intelligens", "artificial intelligence", "maskininlarning", "machine learning", "maskinlaering", "tekoaly", "kunstig intelligens"], ["ai"]),
    ("cybersäkerhet", ["cybersakerhet", "cybersecurity", "cyber security", "kyberturvallisuus", "informationssakerhet"], ["cyber"]),
    ("software", ["software", "mjukvara", "programvara", "ohjelmisto"], ["saas"]),
    ("data", ["dataanalys", "data analytics", "big data", "datadelning", "data spaces"], ["data"]),
    ("deeptech", ["deep tech", "deeptech", "djupteknik"], []),
    ("quantum", ["quantum", "kvantteknik", "kvantteknologi", "kvantdator"], ["kvant"]),
    ("halvledare", ["halvledar", "semiconductor", "halvleder", "mikroelektronik"], ["chips"]),
    ("robotik", ["robotik", "robotics", "robotiser"], ["robot"]),
    ("automation", ["automation", "automatiser", "automaatio"], []),
    ("bredband", ["bredband", "broadband", "laajakaista"], ["5g", "6g"]),
    ("rymd", ["satellit", "aerospace", "rymdteknik", "avaruus", "romfart"], ["rymd", "space", "esa"]),
    # Energi / klimat / miljö
    ("energi", ["energi", "energy", "energia"], []),
    ("energilagring", ["energilagring", "energy storage", "energilager"], []),
    ("energieffektivisering", ["energieffektiv", "energy efficien", "energiatehokk"], []),
    ("solceller", ["solcell", "solenergi", "solar", "aurinkoenergia", "solkraft"], []),
    ("vindkraft", ["vindkraft", "wind power", "wind energy", "havsvind", "tuulivoima", "vindenergi"], []),
    ("vätgas", ["vatgas", "hydrogen", "vety"], []),
    ("batterier", ["batteri", "battery", "akku"], []),
    ("förnybar energi", ["fornybar", "renewable", "uusiutuva"], []),
    ("kärnkraft", ["karnkraft", "nuclear", "ydinvoima", "kjernekraft"], ["smr"]),
    ("klimat", ["klimat", "climate", "klima", "ilmasto"], []),
    ("klimatanpassning", ["klimatanpassning", "climate adaptation", "klimatilpasning"], []),
    ("utsläppsminskning", ["utslapp", "emission", "koldioxid", "avkarboniser", "decarboni", "karbonfangst", "ccs", "ccu"], ["co2"]),
    ("hållbarhet", ["hallbar", "sustainab", "baerekraft", "bærekraft", "kestav"], []),
    ("miljö", ["miljo", "miljø", "environment", "ymparisto"], []),
    ("cirkulär ekonomi", ["cirkular", "circular econom", "sirkulaer", "sirkulær", "kiertotalous", "cirkularitet", "circularity"], []),
    ("återvinning", ["atervinning", "recycl", "gjenvinning", "kierratys"], []),
    ("avfall", ["avfall", "waste"], []),
    ("vatten", ["vattenresurs", "vattenforsorjning", "vattenrening", "water", "vesihuolto", "vannress"], ["vatten", "vann"]),
    ("biologisk mångfald", ["biologisk mangfald", "biodivers", "naturmangfold", "ekosystem", "luonnon monimuotoisuus"], []),
    ("naturvård", ["naturvard", "naturskydd", "nature conservation", "naturrestaurering", "restoration of nature"], []),
    ("cleantech", ["cleantech", "clean tech", "miljoteknik", "miljoteknologi", "miljøteknologi", "gron teknik", "grønn teknologi", "green tech"], []),
    ("grön omställning", ["gron omstallning", "grønn omstilling", "green transition", "vihrea siirtyma"], []),
    # Hälsa / life science
    ("hälsa", ["halsa", "health", "helse", "terveys", "halso"], []),
    ("sjukvård", ["sjukvard", "healthcare", "health care", "helsetjenest", "terveydenhuolto", "omsorg", "patient"], ["vard"]),
    ("medtech", ["medtech", "medicinteknik", "medical technology", "medisinsk teknologi", "medical device"], []),
    ("biotech", ["biotech", "bioteknik", "bioteknologi", "biotechnology"], []),
    ("läkemedel", ["lakemedel", "pharmaceutical", "legemiddel", "laakkeet"], ["pharma"]),
    ("klinisk forskning", ["klinisk", "clinical", "kliininen"], []),
    ("e-hälsa", ["e-halsa", "ehealth", "e-health", "digital halsa", "digital health", "valfardsteknik"], []),
    ("life science", ["life science", "livsvetenskap"], []),
    # Jordbruk / livsmedel / natur
    ("jordbruk", ["jordbruk", "agricult", "landbruk", "maatalous", "farming", "lantbruk"], ["agri"]),
    ("livsmedel", ["livsmedel", "food", "elintarvike", "naeringsmiddel", "matproduktion", "matsvinn"], ["mat"]),
    ("landsbygd", ["landsbygd", "rural", "maaseutu", "distrikt"], []),
    ("skog", ["skogsbruk", "skogsnaring", "forest", "metsa", "skognaering"], ["skog"]),
    ("bioekonomi", ["bioekonomi", "bioeconomy", "biookonomi", "biobaser", "biobased"], []),
    ("fiske", ["fiskeri", "fishery", "fishing", "kalastus", "fiskenaering"], ["fiske"]),
    ("vattenbruk", ["vattenbruk", "akvakultur", "aquacultur", "havbruk", "vesiviljely"], []),
    ("maritim", ["maritim", "maritime", "sjofart", "shipping", "merenkulku", "offshore", "havsnaring", "blue economy"], ["hav"]),
    # Industri / tillverkning / handel
    ("tillverkning", ["tillverkning", "manufactur", "produksjon", "produktion", "valmistus"], []),
    ("industri", ["industri", "industry", "teollisuus"], []),
    ("materialteknik", ["materialteknik", "advanced materials", "avancerade material", "nya material", "materialutveckling"], []),
    ("gruvindustri", ["gruvindustri", "gruvnaring", "mining", "raw materials", "ramaterial", "mineral", "malm", "kaivos"], ["gruv"]),
    ("export", ["export", "eksport", "vienti"], []),
    ("internationalisering", ["internationalis", "internasjonalis", "kansainvalistym", "international"], []),
    ("handel", ["utrikeshandel", "e-handel", "e-commerce", "ulkomaankauppa"], ["handel", "trade"]),
    ("fintech", ["fintech", "finansteknik"], []),
    # Transport / bygg
    ("transport", ["transport", "logistik", "logistic", "liikenne", "godstrafik"], []),
    ("mobilitet", ["mobilitet", "mobility", "kollektivtrafik", "liikkuvuus"], []),
    ("elfordon", ["elfordon", "electric vehicle", "laddinfrastruktur", "ladeinfrastruktur", "elbil", "sahkoauto"], []),
    ("flygteknik", ["flygteknik", "aviation", "luftfart", "aeronautic", "ilmailu"], ["flyg"]),
    ("bygg", ["byggnad", "byggsektor", "construction", "rakentaminen", "byggebransje", "anlaggning", "renovering"], ["bygg"]),
    ("bostad", ["bostad", "bostader", "housing"], ["bolig"]),
    ("fastighet", ["fastighet", "real estate", "eiendom", "kiinteisto"], []),
    ("infrastruktur", ["infrastruktur", "infrastructure"], []),
    ("stadsutveckling", ["stadsutveckling", "urban development", "stadsplanering", "urban planning", "byutvikling", "smart city", "smarta stader"], ["urban"]),
    # Kultur / kreativt
    ("kultur", ["kultur", "culture", "cultural", "kulttuuri"], []),
    ("konst", ["konstnar", "konstprojekt", "artist", "bildkonst", "taide", "kunstner"], ["konst", "arts"]),
    ("film", ["filmproduktion", "audiovisu", "dokumentarfilm"], ["film"]),
    ("media", ["media", "medier", "journalisti"], []),
    ("kreativa näringar", ["kreativ", "creative", "luova", "kreative"], []),
    ("musik", ["musik", "music", "musiikki"], []),
    ("teater", ["teater", "theatre", "theater", "scenkonst", "performing arts"], []),
    ("litteratur", ["litteratur", "literature", "kirjallisuus"], []),
    ("design", ["design", "muotoilu", "formgivning"], []),
    ("kulturarv", ["kulturarv", "cultural heritage", "kulttuuriperinto"], []),
    # Samhälle / övrigt
    ("utbildning", ["utbildning", "education", "opetus", "koulutus", "utdanning"], []),
    ("forskning", ["forskning", "research", "tutkimus", "forsker"], ["fou", "r&d"]),
    ("innovation", ["innovation", "innovasjon", "innovaatio", "innovativ"], []),
    ("startup", ["startup", "start-up", "uppstartsbolag", "oppstartsbedrift", "kasvuyritys"], []),
    ("entreprenörskap", ["entreprenor", "entrepreneur", "yrittaj", "grunder", "gründer", "foretagande"], []),
    ("kompetensutveckling", ["kompetens", "skills", "osaaminen", "kompetanse", "fortbildning"], []),
    ("arbetsmarknad", ["arbetsmarknad", "employment", "sysselsatt", "tyollisyys", "arbeidsmarked"], []),
    ("jämställdhet", ["jamstalldhet", "gender equality", "likestilling", "tasa-arvo"], []),
    ("integration", ["integration", "integrasjon", "inkludering", "kotoutuminen"], []),
    ("civilsamhälle", ["civilsamhalle", "ideell", "frivillig", "civil society", "folkbildning", "vapaaehtois"], []),
    ("välfärd", ["valfard", "welfare", "velferd", "hyvinvointi"], []),
    ("demokrati", ["demokrati", "democracy", "demokratia"], []),
    ("säkerhet", ["sakerhet", "security", "turvallisuus", "beredskap", "totalforsvar"], []),
    ("försvar", ["forsvar", "defence", "defense", "puolustus"], []),
    ("turism", ["turism", "tourism", "besoksnaring", "matkailu", "reiseliv"], []),
    ("sport", ["idrott", "sport", "urheilu"], []),
    ("barn och unga", ["barn och unga", "ungdom", "children and youth", "nuoriso"], []),
]

MAX_KEYWORDS = 12


def _word_pattern(word):
    return re.compile(r'(?<![a-z0-9])' + re.escape(word) + r'(?![a-z0-9])')


# Precompiled per-concept matchers: list of (canonical, [regex]).
_MATCHERS = [
    (
        canonical,
        [re.compile(re.escape(t)) for t in substr_triggers]
        + [_word_pattern(t) for t in word_triggers],
    )
    for canonical, substr_triggers, word_triggers in LEXICON
]


def extract_grant_keywords(title, description=''):
    """Extract canonical keywords from a grant's own title/description.

    Returns keywords ordered by first occurrence in the text (title first),
    capped at MAX_KEYWORDS.
    """
    text = _normalize(f"{title or ''} {description or ''}")
    if not text.strip():
        return []
    found = []
    for canonical, patterns in _MATCHERS:
        pos = min((m.start() for m in (p.search(text) for p in patterns) if m), default=None)
        if pos is not None:
            found.append((pos, canonical))
    found.sort()
    return [kw for _, kw in found[:MAX_KEYWORDS]]


def _split_compound(keyword):
    """Split compound scraper keywords like "digitalt/ai" or "transport, logistik"."""
    return [p.strip() for p in re.split(r'[/,;|]', keyword or '') if p.strip()]


def refine_keywords(title, description, source_keywords=None):
    """Build the final per-grant keyword list.

    Lexicon extraction from the grant's own text comes first; scraper-provided
    keywords are kept only when they occur in that text (so source-level
    boilerplate no longer makes sibling grants identical). Compounds are
    split, duplicates removed diacritic-insensitively.
    """
    text = _normalize(f"{title or ''} {description or ''}")
    result = extract_grant_keywords(title, description)
    seen = {_normalize(kw).replace(' ', '') for kw in result}

    for raw_kw in (source_keywords or []):
        for part in _split_compound(raw_kw):
            key = _normalize(part).replace(' ', '')
            if not key or key in seen:
                continue
            norm_part = _normalize(part)
            grounded = (
                norm_part in text
                if len(norm_part) >= 5
                else _word_pattern(norm_part).search(text) is not None
            )
            if grounded:
                seen.add(key)
                result.append(part)

    return result[:MAX_KEYWORDS + 3]
