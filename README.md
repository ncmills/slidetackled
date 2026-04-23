# slidetackled.com

a toast generator. AIM-era aesthetic, one button.

## What's on the page

- Rotating ticker at top pulls from `capstone.md` (your originals)
- POUR button pulls a random toast from `toasts.md` (the archive)
- 👍 / 👎 per toast — weighted engine favors liked toasts, never buries disliked ones
- Hidden: press `y` for YELL mode, `~` for CLI, visit `/marquee` or `/away`

## Daily authoring

1. Edit `toasts.md` (archive) or `capstone.md` (ticker).
2. `git commit && git push`. Vercel rebuilds in ~2 min.

## Local

```
npm install
npm run build
npm start              # http://localhost:5173
npm test
```

Note: `/api/*` routes need `vercel dev` to actually run (they require Vercel KV). Without it, the site works but counters + votes are local-only.

## Deploy (one-time setup)

```bash
cd ~/slidetackled

# 1. Create GitHub repo (new, private or public — your call)
gh repo create slidetackled --private --source=. --remote=origin --push

# 2. Create fresh Vercel project + link
vercel link            # pick "Create a new project", name: slidetackled

# 3. Provision fresh Vercel KV store
#    → Vercel dashboard → Storage → Create KV → name: slidetackled-kv
#    → Connect to slidetackled project (auto-populates KV_REST_API_URL + KV_REST_API_TOKEN)

# 4. Attach the domain (you already own it at Vercel)
vercel domains add slidetackled.com
vercel alias set $(vercel inspect --prod --wait --token ...) slidetackled.com

# 5. First deploy
git push              # Vercel GitHub integration auto-builds
```

## Keyboard

- `Space` / `Enter` — POUR
- `y` — Yell mode
- `~` — CLI mode
- `Esc` — exit any overlay

## Hidden routes

- `/yell` — big-font yell mode
- `/cli` — terminal
- `/marquee` — scrolling ticker
- `/away` — AIM away-message

Deep links: `https://slidetackled.com/#toast=N` jumps to archive toast N.
