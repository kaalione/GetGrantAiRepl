import hashlib
import re


def normalize_title(title):
    if not title:
        return ""
    title = title.lower().strip()
    title = re.sub(r'[^\w\s]', '', title)
    title = re.sub(r'\s+', ' ', title)
    return title


def title_similarity(title1, title2):
    t1 = normalize_title(title1)
    t2 = normalize_title(title2)

    if not t1 or not t2:
        return 0.0

    if t1 == t2:
        return 1.0

    words1 = set(t1.split())
    words2 = set(t2.split())

    if not words1 or not words2:
        return 0.0

    intersection = words1 & words2
    union = words1 | words2

    return len(intersection) / len(union)


def content_hash(description):
    if not description:
        return None
    normalized = re.sub(r'\s+', ' ', description.lower().strip())
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def is_duplicate(new_grant, existing_grants, threshold=0.85):
    new_title = normalize_title(new_grant.get('title', ''))
    new_hash = content_hash(new_grant.get('description', ''))

    for existing in existing_grants:
        if new_grant.get('url') == existing.get('url'):
            return True, existing.get('id')

        sim = title_similarity(new_grant.get('title', ''), existing.get('title', ''))
        if sim >= threshold:
            return True, existing.get('id')

        if new_hash and new_hash == content_hash(existing.get('description', '')):
            return True, existing.get('id')

    return False, None
