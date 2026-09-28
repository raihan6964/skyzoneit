"""Unit tests for the matching logic used by the Skyzone IT verification service."""

from datetime import date

from scraper import (
    Review,
    match_submissions,
    name_match_score,
    normalize_name,
    source_label,
)

TODAY = date(2026, 9, 28)
SUBMITTED = date(2026, 9, 27)


def make_review(
    author: str,
    text: str = "Great app",
    day: date = date(2026, 9, 28),
) -> dict[str, object]:
    return {"author": author, "text": text, "date": day.isoformat()}


def make_submission(
    submission_id: str,
    name: str,
    day: date = SUBMITTED,
) -> dict[str, object]:
    return {"id": submission_id, "reviewer_name": name, "submitted_date": day.isoformat()}


def test_exact_name_match() -> None:
    reviews = [make_review("Rakib Hasan")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results == [
        {
            "id": "sub-1",
            "found": True,
            "matched_name": "Rakib Hasan",
            "review_date": "2026-09-28",
            "review_text": "Great app",
        }
    ]


def test_case_and_accent_insensitive_match() -> None:
    reviews = [make_review("RÁkib Hášan")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "rakib  HASAN")], today=TODAY
    )
    assert results[0]["found"] is True
    assert results[0]["matched_name"] == "RÁkib Hášan"


def test_punctuation_is_ignored() -> None:
    reviews = [make_review("Rakib-Hasan.")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "rakib hasan!")], today=TODAY
    )
    assert results[0]["found"] is True


def test_normalize_name_strips_accents_and_punctuation() -> None:
    assert normalize_name("  RÁkib,  Hášan!  ") == "rakib hasan"


def test_similarity_match() -> None:
    reviews = [make_review("Rakib Hossain")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hossan")], today=TODAY
    )
    assert results[0]["found"] is True
    assert results[0]["matched_name"] == "Rakib Hossain"


def test_submitted_name_matches_shorter_store_name() -> None:
    reviews = [make_review("Rakib")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is True
    assert results[0]["matched_name"] == "Rakib"


def test_short_store_name_matches_longer_submitted_name() -> None:
    reviews = [make_review("Rakib Hasan Mia")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is True


def test_short_names_require_exact_match() -> None:
    assert name_match_score("Al", "Alexander") is None
    assert name_match_score("Ali", "Ali") == 1.0
    assert name_match_score("", "Rakib") is None


def test_generic_google_user_is_not_matched() -> None:
    reviews = [make_review("a Google User")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is False
    assert results[0]["matched_name"] is None
    assert results[0]["review_date"] is None
    assert results[0]["review_text"] is None


def test_generic_store_name_matches_only_an_equally_generic_submission() -> None:
    reviews = [make_review("A Google User")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "a google user")], today=TODAY
    )
    assert results[0]["found"] is True


def test_date_window_rejects_review_before_submitted_date() -> None:
    reviews = [make_review("Rakib Hasan", day=date(2026, 9, 25))]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is False


def test_date_window_allows_one_day_of_backwards_slack() -> None:
    reviews = [make_review("Rakib Hasan", day=date(2026, 9, 26))]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is True


def test_date_window_rejects_review_after_today() -> None:
    reviews = [make_review("Rakib Hasan", day=date(2026, 9, 30))]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is False


def test_date_window_allows_one_day_of_forwards_slack() -> None:
    reviews = [make_review("Rakib Hasan", day=date(2026, 9, 29))]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is True


def test_one_store_review_matches_at_most_one_submission() -> None:
    reviews = [make_review("Rakib Hasan")]
    results = match_submissions(
        reviews,
        [
            make_submission("sub-1", "Rakib Hasan"),
            make_submission("sub-2", "Rakib Hasan"),
        ],
        today=TODAY,
    )
    assert [item["found"] for item in results] == [True, False]
    assert results[0]["matched_name"] == "Rakib Hasan"
    assert results[1]["matched_name"] is None


def test_greedy_assignment_prefers_the_closest_review() -> None:
    reviews = [make_review("Md. Rakib Hasan"), make_review("Rakib Hasan")]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["matched_name"] == "Rakib Hasan"


def test_every_submission_id_appears_exactly_once() -> None:
    reviews = [make_review("Someone Else")]
    results = match_submissions(
        reviews,
        [
            make_submission("sub-1", "Rakib Hasan"),
            make_submission("sub-2", "Karim Uddin"),
        ],
        today=TODAY,
    )
    assert [item["id"] for item in results] == ["sub-1", "sub-2"]
    assert all(item["found"] is False for item in results)
    assert results[1] == {
        "id": "sub-2",
        "found": False,
        "matched_name": None,
        "review_date": None,
        "review_text": None,
    }


def test_review_objects_and_dicts_are_both_supported() -> None:
    reviews = [Review(author="Rakib Hasan", text="Nice", review_date=date(2026, 9, 28))]
    results = match_submissions(
        reviews, [make_submission("sub-1", "Rakib Hasan")], today=TODAY
    )
    assert results[0]["found"] is True


def test_source_labels() -> None:
    assert source_label("android") == "play"
    assert source_label("ios") == "appstore"
