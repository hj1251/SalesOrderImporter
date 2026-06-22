# Aceparts PO Importer — porting notes (Vercel)

## What this app does
ChatGPT-style single-input web app. A user pastes messy purchase-order text (+ optional
English instructions), clicks Submit, and the backend calls an LLM (OpenAI Chat Completions
or Anthropic Messages, using the user's OWN API token from the settings gear) to parse the
text into `{ columns, rows }`. It then builds a `.xlsm` workbook (SheetJS, sheet "Aceparts")
and serves it as a backend download. A preview table renders the parsed rows.

## Key files
- `server/llm.ts` — `callOpenAI`, `callAnthropic`, `demoParse`, `parseOrder`, `buildSystemPrompt`.
  Calls `https://api.openai.com/v1/chat/completions` (with `response_format: json_object`) and
  `https://api.anthropic.com/v1/messages` DIRECTLY via `fetch` using the user's token.
  NO Perplexity proxy, NO platform credentials.
- `server/xlsm.ts` — builds the `.xlsm` buffer (bookType `xlsm`), MIME
  `application/vnd.ms-excel.sheet.macroEnabled.12`, filename `aceparts_export.xlsm`.
- `server/routes.ts` — `GET/PUT /api/settings`, `POST /api/generate`, `GET /api/download/:id`.
- `server/storage.ts` — SQLite single-row `settings` table + in-memory map of generated workbooks.
- `shared/schema.ts` — settings table, `DEFAULT_COLUMNS` (the Aceparts baseline), request schemas.
- `client/src/pages/home.tsx` — single composer, preview, download. Settings in React Context
  (`client/src/lib/settings.tsx`) for the session + persisted to the backend.
- `client/src/components/SettingsDialog.tsx` — provider/token/model/custom-context modal.

## Demo mode
When the provider is `demo`, or any provider is selected with no token, `demoParse` runs a
deterministic heuristic so the whole generate → download → preview flow works WITHOUT a key.
Real OpenAI/Anthropic paths are fully implemented and verified (they surface provider 401s
when given an invalid token, proving direct calls).

## Local run
- `npm install` (xlsx already added).
- Dev: `npm run dev` → Express + Vite on port 5000.
- Build: `npm run build` → `dist/public` (frontend) + `dist/index.cjs` (server).
- Prod boot: `node dist/index.cjs` (serves API + static on port 5000). Both verified.

## Vercel porting caveats
1. **Server model.** The template runs a single Express server (`server/index.ts` → `dist/index.cjs`)
   that serves both the API and the static client. For Vercel, the cleanest port is to expose the
   Express app as a serverless function (e.g. `api/[...path].ts` using `serverless-http`, or move
   each route into `/api/*.ts` handlers) and deploy `dist/public` as static output. All LLM logic
   is already isolated in `server/llm.ts` and is provider-agnostic / proxy-free, so it ports as-is.
2. **SQLite is ephemeral on serverless.** `better-sqlite3` writes to `data.db` on local disk; on
   Vercel serverless that filesystem is read-only/ephemeral, so persisted settings will not survive
   between invocations. This is acceptable per spec — settings are also held in React state for the
   session. For durable persistence on Vercel, swap the `settings` storage for a hosted store
   (Vercel KV / Postgres / Upstash). The settings API surface (`GET/PUT /api/settings`) stays the same.
3. **In-memory download store.** `GET /api/download/:id` reads the workbook from an in-memory map.
   On serverless this won't persist across invocations/instances. For Vercel, either (a) have
   `/api/generate` return the workbook bytes as base64 and let `/api/download` accept them, or
   (b) regenerate on download, or (c) store in KV/blob. Locally (single long-lived process) it works.
4. **`better-sqlite3` is a native module.** If you keep SQLite, ensure the Vercel build includes the
   prebuilt binary for the Node runtime, or replace it per (2).
5. **Frontend API base.** `client/src/lib/queryClient.ts` uses a `__PORT_5000__` placeholder for the
   sandbox proxy. On Vercel, same-origin relative `/api/...` calls work directly; the placeholder
   resolves to "" (relative) when not replaced, which is correct for Vercel.
6. **CORS.** Calls to OpenAI/Anthropic happen server-side, so no browser CORS concerns.
