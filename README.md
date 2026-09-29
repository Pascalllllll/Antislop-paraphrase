# Antislop Paraphrase

Paste text that sounds like a chatbot wrote it and get it back with the tells crossed out.

It swaps buzzwords for plain words, cuts lines like "I hope this helps!", and marks every edit so you can check it. Your text never leaves your browser.

## Run locally

You need [Node.js](https://nodejs.org) 18 or newer. Check with `node -v`. There is nothing to install.

1. Open a terminal in this folder.
2. Run `npm start`.
3. Open http://localhost:8080 in your browser.

Press `Ctrl + C` in the terminal to stop it.

No Node? `python3 -m http.server 8080` serves the page too, just without the security headers. Opening `index.html` by double-click is not supported, because browsers block parts of the page on `file://`.

Run the engine tests with `npm test`.

## Deploy

Upload the folder as-is to any static host.

- **Vercel:** `vercel deploy --prod` from this folder. Headers come from `vercel.json`.
- **Netlify / Cloudflare Pages:** point the site at this folder with no build command. Headers come from `_headers`.
- **Anything else (nginx, S3, GitHub Pages):** copy the headers from `_headers` into your host's config. The page also carries its CSP in a `<meta>` tag, so the main protection holds even where you can't set headers.

Keep `vercel.json` and `_headers` in sync if you change one.

## Files

| Path | What it does |
|---|---|
| `index.html` | The page |
| `css/style.css` | All styling, light and dark themes |
| `js/engine.js` | The rewrite rules and word diff. Pure functions, shared by the worker, the page, and tests |
| `js/worker.js` | Runs the rewrite off the main thread so long texts don't freeze the tab |
| `js/app.js` | UI wiring |
| `js/tour.js` | First-visit tour; replay it from the Tour button |
| `js/theme-init.js` | Applies a saved theme before first paint |
| `fonts/` | Inter, bundled so visitors don't load it from Google. License in `fonts/OFL.txt` |
| `scripts/serve.mjs` | Local preview server |

## Security

- Strict CSP: scripts, styles, and the worker load only from the site itself, and `connect-src 'none'` stops the page from sending anything anywhere.
- User text is only ever written with `textContent` or `.value`, never parsed as HTML.
- No cookies, no analytics, no third-party requests. The Inter font is served from the site itself. `localStorage` holds only the theme and rule toggles.
- Framing is blocked (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).

## Limits

- 150,000 words per run.
- It is a set of rules, not a language model. It swaps and cuts phrases it recognizes and leaves sentence structure alone.
- In the marked view, a single paragraph with more than about 3,000 edits is shown as one replaced block. The clean text is unaffected.
