# Splitify

Splitify is a bill-splitting web app with a shareable bill link flow:

1. Upload a bill image on `index.html`
2. AI extracts line items (Gemini)
3. Confirm total paid (including tip)
4. Get a unique link like `bill.html?billId=...`
5. Friends claim items and view live summary

## Supabase setup (overview)

- **Database (Postgres)** stores bills, line items, claims, and app config in the **`splitify`** schema.
- **Storage** bucket `splitify` stores receipt photos.
- **Edge Function** `splitify-api` is your API: same behavior as the old Google Apps Script backend (`{ error, data }` responses, same `action` names).

The frontend only needs the **function URL** in config. It does **not** need your Supabase anon key or service role key in the browser.

Splitify backend queries are schema-scoped to `splitify` (no fallback to `public`).

---

## Step-by-step: Supabase for beginners

Follow these in order. Pause after each major step and confirm it worked (notes say how).

### Step 1 — Create a Supabase account and project

1. Go to [https://supabase.com](https://supabase.com) and sign up (e.g. **Continue with GitHub**).
2. In the dashboard, click **New project**.
3. Choose an **organization** (your personal org is fine), **name** the project (e.g. `splitify`), pick a **region** close to you, and set a **database password**.
   - **Save this password somewhere safe.** You will need it for the database connection string in Step 5.
4. Wait until the project finishes provisioning (green “Project is ready” or similar).

**Check:** You see your project dashboard with **Project Settings** in the left sidebar.

---

### Step 2 — Create tables and storage (run the migration SQL)

1. In the Supabase dashboard, open **SQL Editor**.
2. Click **New query**.
3. On your computer, open the file [`supabase/migrations/20250422120000_splitify_schema.sql`](supabase/migrations/20250422120000_splitify_schema.sql) in this repo, **copy its entire contents**, paste into the SQL Editor, and click **Run**.
4. You should see **Success** with no errors.
5. Open **Settings** -> **API** and add `splitify` in **Exposed Schemas**.

**Check:**

- **Table Editor** shows tables in schema `splitify`: `bills`, `bill_items`, `claims`, `config_entries`, `upload_jobs`.
- **Storage** shows a bucket named **`splitify`**.

---

### Step 3 — Collect three values you will need later

Open **Project Settings** (gear icon) → **API**:

| What | Where | Used for |
|------|--------|----------|
| **Project URL** | Field **Project URL** | Edge Function secret `SUPABASE_URL` |
| **service_role** key | **Project API keys** → `service_role` (click **Reveal**) | Edge Function secret `SUPABASE_SERVICE_ROLE_KEY` — **never** put this in frontend code or public repos |

**Check:** You can copy the Project URL; you can reveal the `service_role` key (keep it private).

---

### Step 4 — Install the Supabase CLI and log in

Edge Functions are deployed from your machine using the CLI.

1. Install the CLI: [Supabase CLI docs]()https://supabase.com/docs/guides/cli/getting-started (choose **Windows**, **macOS**, or **Linux**).
2. In a terminal, run:

   ```bash
   supabase login
   ```

   Follow the browser flow to authorize the CLI.

**Check:** `supabase --version` prints a version number.

---

### Step 5 — Link this repo to your project and deploy the API

1. In the Supabase dashboard: **Project Settings** → **General** → copy **Reference ID** (a short string like `abcdxyz123`).
2. In a terminal, `cd` to this repo folder (`Splitify`), then run:

   ```bash
   supabase link --project-ref yzyipxvlsoxfphwobfkb
   ```

   Use the Reference ID from the dashboard. Enter your **database password** if prompted.

3. Deploy the function (still in the repo root):

   ```bash
   supabase functions deploy splitify-api --no-verify-jwt
   ```

   `--no-verify-jwt` matches how the Splitify frontend calls the API (no Supabase login required for guests).

**Check:** Dashboard → **Edge Functions** lists **`splitify-api`**. Your function URL is:

`https://YOUR_REFERENCE_ID.supabase.co/functions/v1/splitify-api`

(Replace `YOUR_REFERENCE_ID` with your real ref.)

---

### Step 6 — Set Edge Function secrets

The function needs secrets at runtime. In the dashboard: **Edge Functions** → **splitify-api** → **Secrets** (or **Manage secrets**).

Add each of these **names** with the **values** below:

| Secret name | Value |
|-------------|--------|
| `SUPABASE_URL` | Your **Project URL** from Step 3 (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | The **`service_role`** key from Step 3 |
| `GEMINI_API_KEY` | Your [Google AI Studio](https://aistudio.google.com/apikey) (or Google Cloud) Gemini API key |
| `SUPABASE_DB_URL` | A **direct** Postgres connection URI (see below) |

**`SUPABASE_DB_URL` (important):**

1. Open **Project Settings** → **Database**.
2. Under **Connection string**, choose **URI** (not “Transaction pooler” only).
3. The host should look like **`db.YOUR_REFERENCE_ID.supabase.co`** and the port should be **`5432`**.
4. Paste the URI and **replace `[YOUR-PASSWORD]`** with the database password you set in Step 1. If your password has special characters, you may need to [URL-encode](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) it inside the URI.

Example shape (your values will differ):

`postgresql://postgres:YOUR_PASSWORD@db.YOUR_REFERENCE_ID.supabase.co:5432/postgres`

**Why this exists:** saving claims uses a database transaction and a lock. That requires a direct database connection from the function, not only the REST API.

**Alternative (CLI):** you can set secrets from the terminal, for example:

```bash
supabase secrets set SUPABASE_URL="https://YOUR_REF.supabase.co" --project-ref YOUR_REF
```

Repeat for each secret name (see [secrets CLI](https://supabase.com/docs/guides/functions/secrets)).

**Check:** After saving secrets, trigger a **new deploy** or wait a minute, then test the API (Step 9). If claims fail with a message about `SUPABASE_DB_URL`, re-check the URI and password.

---

### Step 7 — Add config rows (`config_entries`)

The app reads icons, optional quips, and the active Gemini model from **`splitify.config_entries`**.

**Option A — Table Editor (easiest):**

1. **Table Editor** → **`config_entries`** → **Insert row**.
2. Add rows such as:
   - `key`: `aiModelActive`, `value`: `gemini-3-flash-preview` (or another allowed model from the Edge Function code)
   - `key`: `quip`, `value`: a short caption string (you can add several rows with key `quip` or one row with key `quips` depending on what you had in Sheets)
   - `key`: `productIconCategory:drink.beer`, `value`: URL or emoji for that category icon (same pattern as your old Sheet **Config** tab)

**Option B — SQL:** run `INSERT INTO splitify.config_entries (key, value) VALUES (...);` in the SQL Editor.

**Check:** At least `aiModelActive` is set so bill scanning uses a valid model.

---

### Step 8 — Point the Splitify frontend at your function

1. Open [`assets/js/config/sheets-config.js`](assets/js/config/sheets-config.js).
2. Set `API_URL` to your function URL (Step 5), **no trailing slash**:

   `https://YOUR_REFERENCE_ID.supabase.co/functions/v1/splitify-api`

3. Serve the site (any static server) or open `index.html` via your dev setup.

**Check:** Browser devtools **Network** tab shows requests to `.../functions/v1/splitify-api` when you use the app.

---

### Step 9 — Smoke test

1. Open `index.html`, upload a receipt, complete the flow, copy the `bill.html?billId=...` link.
2. Open that link, enter a name, claim items, open **Summary**.
3. Open **Storage** → **`splitify`** — you should see an object under `bills/...` after an upload with an image.

If something fails, open **Edge Functions** → **splitify-api** → **Logs** in the dashboard and read the error message.

---

### Quick reference — secret names

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access (DB + Storage from the function) |
| `GEMINI_API_KEY` | Bill image AI extraction |
| `SUPABASE_DB_URL` | Direct Postgres URI on port **5432** (claim submission transaction) |

## Migrating from Google Sheets + Drive

If you already have data on the old Apps Script backend:

1. Keep the old web app URL handy.
2. Set environment variables and run:

```bash
set LEGACY_API_URL=https://script.google.com/macros/s/.../exec
set SUPABASE_URL=https://<ref>.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
node scripts/migrate-google-to-supabase.mjs
```

(On macOS/Linux use `export` instead of `set`.)

The script is **idempotent**: bills that already exist in `splitify.bills` are skipped. It copies line items, claims, and bill images into Storage.

If you already have receipt images in the old `bill-images` bucket, run this one-time copy script after deploying latest changes:

```bash
set SUPABASE_URL=https://<ref>.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
node scripts/migrate-bucket-bill-images-to-splitify.mjs
```

(On macOS/Linux use `export` instead of `set`.)

## Manual verification checklist

- Upload a bill image from `index.html`
- Confirm detected total and finalize
- Confirm share link is shown and copied
- Open `bill.html?billId=...` in another browser/session
- Enter a name and submit claims
- Open Summary tab and confirm:
  - by-user totals
  - by-item claimed vs quantity
- Open the bill image from the receipt button
- Open `admin.html`: list bills and delete one (optional)

## Legacy reference

The previous Google Sheets + Apps Script backend is preserved in [`backend/code.gs`](backend/code.gs) for reference only.
