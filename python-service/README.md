# Skyzone IT verification service

Standalone FastAPI microservice used by the Skyzone IT Next.js cron job to check
whether worker-submitted reviews were actually published on the Google Play
Store or the Apple App Store.

## Endpoints

- `GET /health` → `200 {"status": "ok"}`
- `POST /verify` → requires header `x-secret: $PYTHON_SERVICE_SECRET`

The service fetches the newest store reviews for a package, matches them
against the submitted reviewer names (accent/case/punctuation insensitive,
substring or similarity based, ±1 day date window), and returns exactly one
result per submission id.

## Local run

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
pip install pytest
uvicorn main:app --port 8000
```

## Examples

```bash
curl http://localhost:8000/health
```

```json
{"status": "ok"}
```

```bash
curl -X POST http://localhost:8000/verify \
  -H "content-type: application/json" \
  -H "x-secret: testsecret" \
  -d '{"task":{"package_name":"com.example.app","platform":"android"},"submissions":[{"id":"uuid-1","reviewer_name":"Rakib Hasan","submitted_date":"2026-09-27"}]}'
```

```json
{"results":[{"id":"uuid-1","found":false,"matched_name":null,"review_date":null,"review_text":null}],"scraped_count":0,"source":"play"}
```

Without the `x-secret` header (or when `PYTHON_SERVICE_SECRET` is unset) the
service answers `401 {"detail": "Unauthorized"}`. Scrape failures answer
`502 {"detail": "..."}`.

## Tests

```bash
python -m pytest test_scraper.py -q
```

## Deploy to Vercel

Deploy this folder as its own Vercel project (separate from the Next.js app):

```bash
cd python-service
vercel
vercel env add PYTHON_SERVICE_SECRET production
vercel --prod
```

Environment variable (required, otherwise every `/verify` call is rejected):

- `PYTHON_SERVICE_SECRET` — shared secret sent by the Next.js cron job in the
  `x-secret` header.

`vercel.json` configures `main.py` as the FastAPI entrypoint (Vercel detects
the framework preset from `requirements.txt`), and `api/index.py` re-exports
the same app for file-based routing. Set the cron job's service URL to the
deployment domain, e.g. `https://skyzone-verify.vercel.app/verify`.
