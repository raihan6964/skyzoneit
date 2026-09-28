"""FastAPI verification microservice for Skyzone IT."""

from __future__ import annotations

import hmac
import os
from datetime import date
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel

from scraper import ScrapeError, fetch_reviews, match_submissions, source_label

app = FastAPI(title="Skyzone IT verification service", version="1.0.0")


class Task(BaseModel):
    package_name: str
    platform: str


class Submission(BaseModel):
    id: str
    reviewer_name: str
    submitted_date: date


class VerifyPayload(BaseModel):
    task: Task
    submissions: list[Submission]


def require_secret(request: Request) -> None:
    """Reject any request that does not carry the configured shared secret."""
    expected = os.environ.get("PYTHON_SERVICE_SECRET")
    provided = request.headers.get("x-secret")
    if not expected or provided is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/verify")
def verify(payload: VerifyPayload, _: None = Depends(require_secret)) -> dict[str, Any]:
    platform = payload.task.platform.strip().lower()
    if platform not in {"android", "ios"}:
        raise HTTPException(status_code=422, detail="platform must be 'android' or 'ios'")
    try:
        reviews = fetch_reviews(payload.task.package_name, platform)
    except ScrapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Scrape failed: {exc}") from exc
    results = match_submissions(reviews, [item.model_dump() for item in payload.submissions])
    return {
        "results": results,
        "scraped_count": len(reviews),
        "source": source_label(platform),
    }
