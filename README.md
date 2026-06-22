# PO Importer

Paste messy purchase-order text (and optional plain-English instructions), let an LLM structure it, and download a ready-to-upload `.xlsm` spreadsheet. Bring-your-own API key (OpenAI or Claude), or use the built-in **Demo** parser with no key.

## Stack
- Frontend: Vite + React + Tailwind + shadcn/ui
- Backend: Express (runs as a Vercel serverless function via `api/index.ts`)
- Export: SheetJS (`xlsx`), `bookType: "xlsm"`, sheet "Purchase Order"

## Run locally
```bash
npm install
npm run dev          # dev server (frontend + backend on one port)
```

## Build
```bash
npm run build:client # outputs the static frontend to dist/public
```

## Deploy to Vercel
This repo is already configured for Vercel (`vercel.json` + `api/index.ts`).

1. Push to a Git repo and import it in the Vercel dashboard, **or** use the CLI:
   ```bash
   npm i -g vercel
   vercel            # first deploy / link project
   vercel --prod     # production deploy
   ```
2. Vercel runs `npm run build:client` and serves `dist/public`. Requests to `/api/*` route to the Express app exported from `api/index.ts`.

### vercel.json (already included)
- `buildCommand`: `npm run build:client`
- `outputDirectory`: `dist/public`
- Rewrites: `/api/(.*)` → the serverless function, everything else → `index.html`

## How keys work
Settings (provider, API key, model, custom system context) are stored **only in the
browser** via `localStorage`. The key is sent per-request directly to OpenAI
(`api.openai.com`) or Anthropic (`api.anthropic.com`) — there is no proxy and no
server-side database.

### Optional: single shared key instead of bring-your-own
If you'd rather everyone use one backend key, read it from an env var in
`server/llm.ts` (e.g. `process.env.OPENAI_API_KEY`) instead of the request body,
and set it in Vercel project settings (`vercel env add OPENAI_API_KEY`).

## Notes
- The default column layout lives in `shared/schema.ts` (`DEFAULT_COLUMNS`). The
  LLM is prompted to map fields dynamically, so columns can change per order.
- Export filename: `po_export.xlsm`.
