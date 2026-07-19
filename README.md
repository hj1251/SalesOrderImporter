# Sales Order Importer

https://po-blond-rho.vercel.app

A rule-based tool for turning a customer's order file into a spreadsheet that's ready to import — no AI involved. Paste or attach a CSV, define which stock codes should automatically get extra rows added after them (a linked accessory, a delivery fee, etc.), and export a ready-to-upload `.xlsm`.

---

## Background

Customers send in their orders as messy `.xlsx`/CSV files, one per customer. Today, a sales rep has to open each one and manually add, line by line:

- A **linked item** row for products that need one alongside them
- A **delivery fee** row

The previous solution to this was a separate Excel file *per customer*, each with its own VBA macro: paste the customer's data in, click a button, and the macro would spit out an importable file. That worked, but every customer's file was its own one-off — low efficiency to run, hard to maintain, and completely inflexible if a customer's format or rules changed even slightly.

**Sales Order Importer replaces those per-customer VBA files with one tool.** It's deliberately *not* AI-based: the rules for "which stock code needs which extra row" are well-defined and don't need an LLM to guess at — a hard-coded lookup was already fully correct for this problem, so the tool models it directly (search term → template row) instead of using AI as an unnecessary indirection. See [`SalesOrderImporterAI`](https://github.com/hj1251/SalesOrderImporterAI) for the sibling project that *does* use an LLM, for the harder problem of parsing genuinely unstructured free-text orders.

---

## How to use it

1. **Paste or attach the customer's CSV.** Paste it directly into the text box, or click the paperclip to attach a `.csv` file — either way it's parsed into columns using the first row as headers.
2. **Add a search block for each rule you need.** Click **Add entry**, then type a search term — e.g. a stock code. Every row in the pasted CSV that contains that term anywhere in its values counts as a match.
3. **Define the row(s) to insert after each match.** Inside that search block, click **Add row** to add one or more template rows — fill in only the fields that should be *fixed* (e.g. the linked item's SKU, or a delivery fee amount). Any field left blank is copied from the row that triggered the match instead, so shared details (PO number, delivery address, etc.) carry over automatically.
4. **Repeat** — add as many search blocks as needed (one per stock code / rule).
5. **Export.** Click **Export**: every original row is kept, and each match gets its template row(s) inserted immediately after it. The result downloads as a `.xlsm`, sheet "Purchase Order", ready to import.

This is entirely client-side logic (matching, template merging) — the backend's only job is turning the final table into an `.xlsm` file.

---

## Stack

- **Frontend**: Vite + React + Tailwind + shadcn/ui
- **Backend**: Express (runs as a Vercel serverless function via `api/index.ts`)
- **Export**: SheetJS (`xlsx`), `bookType: "xlsm"`, sheet "Purchase Order"

---

## Project Structure

```text
SalesOrderImporter/
├── api/
│   └── index.ts              # Vercel serverless entrypoint — exports the Express app directly
│
├── client/                   # React frontend (Vite)
│   ├── index.html
│   └── src/
│       ├── App.tsx             # router + context providers (theme, react-query)
│       ├── main.tsx
│       ├── pages/
│       │   ├── home.tsx          # the entire app: CSV input, search blocks, template rows, export, preview
│       │   └── not-found.tsx
│       ├── components/
│       │   ├── Logo.tsx
│       │   └── ui/                  # shadcn/ui component library (generated, not hand-written)
│       ├── hooks/
│       │   ├── use-toast.ts
│       │   └── use-mobile.tsx
│       └── lib/
│           ├── queryClient.ts       # fetch wrapper + react-query client
│           ├── theme.tsx              # dark/light mode
│           └── utils.ts
│
├── server/                   # Express backend
│   ├── app.ts                  # builds the Express app (routes + middleware) — shared by local dev and Vercel
│   ├── index.ts                  # local dev / self-hosted entrypoint (wraps app.ts with an HTTP server)
│   ├── routes.ts                   # POST /api/export — the only endpoint; takes a finished table, returns an .xlsm
│   ├── xlsm.ts                       # builds the .xlsm workbook buffer
│   ├── static.ts                      # serves the built frontend in production (self-hosted only)
│   └── vite.ts                         # Vite dev middleware (dev only, not part of the production bundle path)
│
├── shared/
│   └── schema.ts              # the zod schema for the /api/export request body
│
├── script/
│   └── build.ts                # custom build: vite build (client) + esbuild bundle (server) -> dist/
│
├── vercel.json                # Vercel build/rewrite config
├── vite.config.ts
├── tailwind.config.ts
├── components.json            # shadcn/ui generator config
├── tsconfig.json
└── package.json
```

**How a request flows**: everything up through building the final table (parsing the CSV, matching search terms, merging in template rows) happens in `client/src/pages/home.tsx` — there's no server involvement until the user clicks Export. At that point the finished `{ columns, rows }` table is posted to `/api/export` → in dev this hits `server/index.ts` → `server/app.ts` → `server/routes.ts`; on Vercel it hits `api/index.ts` → the same `server/app.ts`. `routes.ts` calls `xlsm.ts` to build the workbook and returns it inline as base64 — no server-side storage anywhere in the request path.

---

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

---

## Next Steps

- **Flexible output columns.** Right now the exported spreadsheet always uses exactly the columns that came in on the pasted/attached CSV — there's no way to add, remove, reorder, or rename columns for the export independently of the input. Letting the user define the output column set directly would make the tool usable even when a customer's file format and the ERP's expected import format don't line up 1:1.
- **Remember past configurations.** Every search block (search term + template rows) has to be typed in from scratch every time, even for a rule that never changes — e.g. "when the order contains SKU ***, add a row and set Unit Cost to 1.99." Saving these configurations (per customer, or as reusable named presets) so they can be picked from a list instead of re-entered would remove almost all of the remaining manual setup on repeat use.

## Notes

- Export filename: `po_export.xlsm`.
- Nothing is persisted server-side and no API key of any kind is needed — the whole tool works offline from the browser's point of view, aside from the final export round-trip.
