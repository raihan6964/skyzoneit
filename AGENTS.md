<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vercel deployment (project: leadforge-ai)

- Production serves https://skyzoneitltd.online
- GitHub auto-deploy is **NOT** connected to this repo (the Vercel project is linked to the old `raihan6962-coder/LeadForge-AI` repo instead). Pushing to `main` does **not** deploy — production went 37 days stale this way once.
- After every push, deploy manually with: `vercel deploy --prod --yes` (Vercel CLI is logged in locally; run from repo root). Then check `vercel ls leadforge-ai` until the newest Production deployment is Ready.
- `vercel.json` sets `"outputDirectory": ".next"` (the project's dashboard default of `dist` is wrong for Next.js) and keeps the daily cron for `/api/cron/verify`.
- Env vars are in Vercel (Production scope). `GROQ_API_KEY` is the Groq key; `GROQ_MODEL` is unset so the code default `openai/gpt-oss-120b` applies (do NOT use gpt-oss-20b: only 8k TPM on this account, which breaks multi-candidate generation).

# Push to GitHub

git add -A
git commit -m "message"
git -c credential.helper= push https://x-access-token:<github_pat>@github.com/raihan6964/skyzoneit.git main
