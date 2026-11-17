# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Splitify is a bill-splitting web app. The user uploads a photo of a bill on `index.html`. AI (Gemini) extracts the line items, the user confirms the total paid including tip, and the app gives them a shareable link of the form `bill.html?billId=...`. Friends open the link, claim their items, and see a live summary. `admin.html` is the admin page.

The frontend is static HTML with vanilla JS and no build step. The backend is the Supabase Edge Function `splitify-api`, using Postgres schema **`splitify`** (tables `bills`, `bill_items`, `claims`, `config_entries`, `upload_jobs`) and Storage bucket `splitify`. It runs on the shared CursorSites Supabase project "Apps" (`yzyipxvlsoxfphwobfkb`).

## Dev server / port

There's no dev server script. Serve the folder statically from the project root:

```powershell
npx serve .        # http://localhost:3000
```

The frontend calls the deployed function at `SPLITIFY_CONFIG.API_URL` in `assets/js/config/sheets-config.js` (no trailing slash), so local pages use live data. The browser never holds Supabase keys.

## Commands

```powershell
supabase functions deploy splitify-api --no-verify-jwt
supabase secrets set NAME="value" --project-ref yzyipxvlsoxfphwobfkb
```

The Edge Function needs these secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_DB_URL`: a direct Postgres URI on port 5432, used by the claim-submission transaction.

There are no automated tests. To smoke-test:

1. Upload a receipt on `index.html` and get the bill link.
2. Open the link and claim some items.
3. Check the Summary.
4. Check that an object appeared under `bills/...` in the `splitify` bucket.

## Architecture

- **Frontend JS:** load in this order: `assets/js/config/sheets-config.js` → `utils/` (`api.js`, `claims-state.js`, `image-compress.js`, `brief-message.js`, `working-indicator.js`, `quips.js`, `formatters.js`) → `components/` (`name-combobox`, `product-row`, `share-claim-dialog`, `summary`) → `pages/` (`uploader.js` for index, `bill.js`, `admin.js`).
- **API:** the function dispatches on an `action` name and responds with `{ error, data }`, the same contract as the old Google Apps Script backend. Every query is scoped to the `splitify` schema, with no fallback to `public`, and `splitify` must be listed under Exposed Schemas in the Supabase dashboard.
- **Runtime config** lives in the `splitify.config_entries` table:
  - `aiModelActive`: the Gemini model to use. It must be one the Edge Function allows.
  - `quip`/`quips`: captions shown in the app.
  - `productIconCategory:<cat>`: the icon for each product category.
- **Legacy:** `backend/code.gs` (Apps Script + Sheets) is kept for reference only. `scripts/migrate-*.mjs` are one-off migration scripts.

## Rules

### Bump the asset cache version

When asked to commit or push, check whether the commit touches client assets: `assets/css/**`, `assets/js/**`, the local asset tags in `*.html`, or `site.webmanifest`. If it does, bump the cache-bust version **in the same commit**:

1. Set a new `SPLITIFY_ASSET_V` in `assets/asset-version.js`, using a compact stamp such as `20261106d` (`YYYYMMDD` + a letter).
2. Replace **every** `?v=...` with that same value in `bill.html`, `index.html`, `admin.html` and the `@import`s in `assets/css/style.css`.
3. Never leave mixed versions behind.

Don't bump for backend-only changes (`supabase/functions/**`, migrations).

### Shared UI patterns

The brief message and working indicator are shared CursorSites patterns. Their specs are in `../cursor-sites-shared/ui/` (`BRIEF_MESSAGE.md`, `WORKING_INDICATOR.md`), and the utils are synced from `cursor-sites-shared` by `../cursor-sites-shared/scripts/sync-ui.ps1`.

- To show a message, use `BriefMessage.show(text, anchorEl, { durationMs: 1200, disableElement })`.
- Never duplicate a brief-message implementation inline in a page script.
- Brief-message styles are in `assets/css/brief-message.css`, plus Splitify pill overrides in `style.css` (`.app--bill .brief-message`).

### Keep share/portion claims in step with theConfessional

The share/portion claim flow (`share-claim-dialog.js`, `claims-state.js`, `product-row.js` and the share wiring on the bill page) also exists in `../theConfessional`. The two apps may look different, but their **behaviour must stay the same**. If a change here would make them behave differently, tell the user or apply the same fix in both.

### Shared Supabase project

Other apps use the same Supabase project. Don't run `supabase db push`; follow `../cursor-sites-shared/supabase/SHARED_DATABASE.md` for schema changes.
