"""Scraping and submission matching for the Skyzone IT verification service."""

from __future__ import annotations

import html
import re
import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from typing import Any

import requests
from google_play_scraper import Sort
from google_play_scraper import app as play_app
from google_play_scraper import reviews as play_reviews

DEFAULT_LIMIT = 400
ANDROID_PAGE_SIZE = 200
ANDROID_MAX_PAGES = 3
ANDROID_LANGUAGES = (("en", "us"), ("bn", "bd"))
IOS_MAX_PAGES = 4
IOS_RSS_COUNTRIES = ("bd", "us")
FETCH_ATTEMPTS = 2
SIMILARITY_THRESHOLD = 0.82
MIN_NAME_LENGTH = 3
DATE_SLACK_DAYS = 1
HTTP_TIMEOUT_SECONDS = 20
USER_AGENT = "Mozilla/5.0 (compatible; SkyzoneIT-Verify/1.0)"
SOURCE_BY_PLATFORM = {"android": "play", "ios": "appstore"}
GENERIC_REVIEWER_NAMES = frozenset(
    {"a google user", "google user", "a user", "user", "anonymous", "unknown"}
)


class ScrapeError(RuntimeError):
    """Raised when reviews cannot be fetched from an app store."""


@dataclass(frozen=True, slots=True)
class Review:
    """A single review fetched from an app store."""

    author: str
    text: str
    review_date: date


def fetch_reviews(package_name: str, platform: str, *, limit: int = DEFAULT_LIMIT) -> list[Review]:
    """Return the newest reviews for ``package_name`` from the requested store."""
    key = platform.strip().lower()
    if key == "android":
        return _fetch_android_reviews(package_name, limit)
    if key == "ios":
        return _fetch_ios_reviews(package_name, limit)
    raise ValueError(f"Unsupported platform: {platform!r}")


def source_label(platform: str) -> str:
    """Return the ``source`` value reported for a platform."""
    return SOURCE_BY_PLATFORM.get(platform.strip().lower(), platform)


def match_submissions(
    reviews: Iterable[Review | Mapping[str, Any]],
    submissions: Iterable[Mapping[str, Any]],
    *,
    today: date | None = None,
) -> list[dict[str, Any]]:
    """Match submissions against reviews, returning exactly one result per submission."""
    current_day = today if today is not None else date.today()
    pool = [_coerce_review(item) for item in reviews]
    consumed = [False] * len(pool)
    results: list[dict[str, Any]] = []
    for submission in submissions:
        submission_id, reviewer_name, submitted_day = _coerce_submission(submission)
        best_index: int | None = None
        best_score = 0.0
        for index, review in enumerate(pool):
            if consumed[index]:
                continue
            if not _within_date_window(review.review_date, submitted_day, current_day):
                continue
            score = name_match_score(reviewer_name, review.author)
            if score is None:
                continue
            if score > best_score:
                best_index = index
                best_score = score
        if best_index is None:
            results.append(
                {
                    "id": submission_id,
                    "found": False,
                    "matched_name": None,
                    "review_date": None,
                    "review_text": None,
                }
            )
            continue
        consumed[best_index] = True
        matched = pool[best_index]
        results.append(
            {
                "id": submission_id,
                "found": True,
                "matched_name": matched.author,
                "review_date": matched.review_date.isoformat(),
                "review_text": matched.text,
            }
        )
    return results


def normalize_name(value: str) -> str:
    """Lowercase, strip accents and punctuation, and collapse whitespace."""
    decomposed = unicodedata.normalize("NFKD", str(value))
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    cleaned = re.sub(r"[\W_]+", " ", unaccented.casefold(), flags=re.UNICODE)
    return cleaned.strip()


def name_match_score(submitted: str, candidate: str) -> float | None:
    """Return a match score in ``[0, 1]`` when two reviewer names line up, else ``None``."""
    submitted_name = normalize_name(submitted)
    candidate_name = normalize_name(candidate)
    if not submitted_name or not candidate_name:
        return None
    if candidate_name in GENERIC_REVIEWER_NAMES:
        return 1.0 if submitted_name == candidate_name else None
    if submitted_name in GENERIC_REVIEWER_NAMES:
        return None
    if len(submitted_name) < MIN_NAME_LENGTH or len(candidate_name) < MIN_NAME_LENGTH:
        return 1.0 if submitted_name == candidate_name else None
    ratio = SequenceMatcher(None, submitted_name, candidate_name).ratio()
    if submitted_name in candidate_name or candidate_name in submitted_name:
        return ratio
    if ratio >= SIMILARITY_THRESHOLD:
        return ratio
    return None


def _within_date_window(review_day: date, submitted_day: date, current_day: date) -> bool:
    earliest = submitted_day - timedelta(days=DATE_SLACK_DAYS)
    latest = current_day + timedelta(days=DATE_SLACK_DAYS)
    return earliest <= review_day <= latest


def _coerce_review(raw: Review | Mapping[str, Any]) -> Review:
    if isinstance(raw, Review):
        return raw
    if not isinstance(raw, Mapping):
        raise TypeError(f"Unsupported review value: {raw!r}")
    if "date" in raw:
        review_date = _parse_date(raw["date"])
    elif "review_date" in raw:
        review_date = _parse_date(raw["review_date"])
    else:
        raise ValueError("review is missing a date")
    return Review(
        author=str(raw.get("author") or ""),
        text=str(raw.get("text") or ""),
        review_date=review_date,
    )


def _coerce_submission(raw: Mapping[str, Any]) -> tuple[str, str, date]:
    if not isinstance(raw, Mapping):
        raise TypeError(f"Unsupported submission value: {raw!r}")
    if "id" not in raw:
        raise ValueError("submission is missing an id")
    if "submitted_date" not in raw:
        raise ValueError("submission is missing a submitted_date")
    return (
        str(raw["id"]),
        str(raw.get("reviewer_name") or ""),
        _parse_date(raw["submitted_date"]),
    )


def _parse_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip().replace(" ", "T")
        date_part = text.split("T", 1)[0]
        try:
            return date.fromisoformat(date_part)
        except ValueError:
            return datetime.strptime(date_part, "%Y-%m-%d").date()
    raise ValueError(f"Unsupported date value: {value!r}")


def _fetch_android_reviews(package_name: str, limit: int) -> list[Review]:
    _assert_android_app(package_name)
    for _attempt in range(FETCH_ATTEMPTS):
        for lang, country in ANDROID_LANGUAGES:
            collected = _collect_android(package_name, lang, country, limit=limit)
            if collected:
                return collected
    return []


def _assert_android_app(package_name: str) -> None:
    errors: list[str] = []
    for lang, country in ANDROID_LANGUAGES:
        try:
            play_app(package_name, lang=lang, country=country)
        except Exception as exc:
            errors.append(f"{lang}-{country}: {exc}")
            continue
        return
    raise ScrapeError(f"Google Play app lookup failed for {package_name!r}: {'; '.join(errors)}")


def _collect_android(package_name: str, lang: str, country: str, *, limit: int) -> list[Review]:
    collected: list[Review] = []
    seen_ids: set[str] = set()
    token: Any = None
    pages = 0
    while pages < ANDROID_MAX_PAGES and len(collected) < limit:
        page_size = min(limit - len(collected), ANDROID_PAGE_SIZE)
        try:
            rows, token = play_reviews(
                package_name,
                lang=lang,
                country=country,
                sort=Sort.NEWEST,
                count=page_size,
                continuation_token=token,
            )
        except Exception as exc:
            raise ScrapeError(f"Google Play scrape failed for {package_name!r}: {exc}") from exc
        pages += 1
        for row in rows:
            review = _android_row_to_review(row, seen_ids)
            if review is not None:
                collected.append(review)
        if not token:
            break
    return collected[:limit]


def _android_row_to_review(row: Mapping[str, Any], seen_ids: set[str]) -> Review | None:
    review_id = str(row.get("reviewId") or "")
    if review_id:
        if review_id in seen_ids:
            return None
        seen_ids.add(review_id)
    author = str(row.get("userName") or "").strip()
    timestamp = row.get("at")
    if not author or timestamp is None:
        return None
    return Review(
        author=author,
        text=str(row.get("content") or ""),
        review_date=_parse_date(timestamp),
    )


def _fetch_ios_reviews(package_name: str, limit: int) -> list[Review]:
    app_id = _resolve_ios_app_id(package_name)
    errors: list[str] = []
    for country in IOS_RSS_COUNTRIES:
        for _attempt in range(FETCH_ATTEMPTS):
            try:
                collected = _collect_ios(app_id, country, limit=limit)
            except ScrapeError as exc:
                errors.append(str(exc))
                continue
            if collected:
                return collected
    if errors:
        raise ScrapeError("; ".join(errors))
    return []


def _collect_ios(app_id: str, country: str, *, limit: int) -> list[Review]:
    collected: list[Review] = []
    base = f"https://itunes.apple.com/{country}/rss/customerreviews"
    for page in range(1, IOS_MAX_PAGES + 1):
        suffix = f"/page={page}" if page > 1 else ""
        url = f"{base}{suffix}/id={app_id}/sortby=mostrecent/json"
        entries = _ios_entries(_get(url))
        if not entries:
            break
        for entry in entries:
            review = _ios_entry_to_review(entry)
            if review is not None:
                collected.append(review)
        if len(collected) >= limit:
            break
    return collected[:limit]


def _resolve_ios_app_id(package_name: str) -> str:
    raw = package_name.strip()
    candidate = raw[2:] if raw[:2].lower() == "id" else raw
    params = {"id": candidate} if candidate.isdigit() else {"bundleId": raw}
    payload = _get("https://itunes.apple.com/lookup", params)
    results = payload.get("results") if isinstance(payload, Mapping) else None
    if isinstance(results, list) and results:
        track_id = results[0].get("trackId") if isinstance(results[0], Mapping) else None
        if track_id:
            return str(track_id)
    raise ScrapeError(f"Could not resolve an App Store id from {package_name!r}")


def _get(url: str, params: Mapping[str, Any] | None = None) -> Any:
    try:
        response = requests.get(
            url,
            params=dict(params or {}),
            timeout=HTTP_TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT},
        )
    except requests.RequestException as exc:
        raise ScrapeError(f"Request to {url} failed: {exc}") from exc
    if response.status_code == 404:
        return {}
    if response.status_code >= 400:
        raise ScrapeError(f"Store responded with HTTP {response.status_code} for {url}")
    try:
        return response.json()
    except ValueError as exc:
        raise ScrapeError(f"Store returned invalid JSON for {url}") from exc


def _ios_entries(payload: Any) -> list[Mapping[str, Any]]:
    if not isinstance(payload, Mapping):
        return []
    feed = payload.get("feed")
    if not isinstance(feed, Mapping):
        return []
    entries = feed.get("entry")
    if isinstance(entries, Mapping):
        return [entries]
    if isinstance(entries, list):
        return [entry for entry in entries if isinstance(entry, Mapping)]
    return []


def _ios_entry_to_review(entry: Mapping[str, Any]) -> Review | None:
    author = _label(_nested(entry, "author", "name"))
    text = html.unescape(_label(_nested(entry, "content")) or _label(entry.get("title")))
    stamp = _label(entry.get("updated")) or _label(entry.get("published"))
    if not author or not stamp:
        return None
    try:
        review_date = _parse_date(stamp)
    except ValueError:
        return None
    return Review(author=author, text=text, review_date=review_date)


def _nested(node: Any, *keys: str) -> Any:
    current = node
    for key in keys:
        if not isinstance(current, Mapping):
            return None
        current = current.get(key)
    return current


def _label(node: Any) -> str:
    if isinstance(node, Mapping):
        value = node.get("label")
        return str(value).strip() if value is not None else ""
    if isinstance(node, str):
        return node.strip()
    return ""
