<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vercel deployment (REAL production)

- Live site https://skyzoneitltd.online is served by the **`skyzoneit` project on the `skyzoneitltd-5672` Vercel account** (skyzoneitltd@gmail.com, team `skyzoneitltd-5672s-projects` / `team_iG80BkLL94BRUhL7clzTApaA`, project id `prj_6DYMLj8gIoGJkPfgBBv1d6HlJLHQ`).
- That project **IS** GitHub-auto-deploy linked to `raihan6964/skyzoneit` (main branch) — pushes DO deploy production automatically. Verify with the Vercel dashboard or API after pushing.
- ⚠️ The `leadforge-ai` project on the `raihan6962-7823` account (old `raihan6962-coder/LeadForge-AI` repo) is **NOT** production — it has no custom domain. Do not update env vars or deploy there expecting the live site to change. On 2026-10-17 this mistake left production on a rate-limited old `GROQ_API_KEY` for a day.
- Manual deploy (if needed) must target the real project: set `VERCEL_ORG_ID=team_iG80BkLL94BRUhL7clzTApaA`, `VERCEL_PROJECT_ID=prj_6DYMLj8gIoGJkPfgBBv1d6HlJLHQ` and pass the skyzoneitltd account token via `--token`, then `vercel deploy --prod --yes` from repo root.
- `vercel.json` sets `"outputDirectory": ".next"` (dashboard default of `dist` is wrong for Next.js) and keeps the daily cron for `/api/cron/verify`.
- Env vars live on the **skyzoneit project** (skyzoneitltd-5672 account). `GROQ_API_KEY` is set (new key, Groq org `org_01m51y4m8ce4krztdsmgb44kbc`). `GROQ_MODEL` and `GROQ_BASE_URL` are NOT set — code defaults `openai/gpt-oss-120b` + `https://api.groq.com/openai/v1` apply (do NOT set gpt-oss-20b: only 8k TPM on this Groq org, which breaks multi-candidate generation).

# Push to GitHub

git add -A
git commit -m "message"
git -c credential.helper= push https://x-access-token:<github_pat>@github.com/raihan6964/skyzoneit.git main
