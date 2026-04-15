# MSR site converted to Netlify + Supabase

This package keeps the existing frontend contract:
- frontend calls `/api/items`
- Netlify rewrites `/api/items` to `netlify/functions/items.js`
- the function reads and writes the `items` table in Supabase

## 1. Create the Supabase project
1. Open your Supabase dashboard.
2. Create a new project.
3. Wait until the database is ready.

## 2. Create the table
1. Open **SQL Editor**.
2. Paste the full content of `supabase-schema.sql`.
3. Run it.

## 3. Get the credentials
From **Project Settings**:
- copy **Project URL**
- copy **service_role** key

Put them in `.env` locally and later in Netlify:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 4. Run locally
```bash
npm install
npm install -g netlify-cli
netlify login
cp .env.example .env
# edit .env with your real values
netlify dev
```

Then open:
- `http://localhost:8888`
- `http://localhost:8888/api/items`

## 5. Deploy to Netlify
1. Push this folder to GitHub.
2. Import the repo into Netlify.
3. Add these environment variables in Netlify:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HAMAL_SECRET` — main password for טופס מלא, דשבורד, ורשימת «כל התחנות»
   - `HAMAL_STATION_KEYS` (optional) — JSON map of station slugs to passwords for volunteer-only access, e.g. `{"lev":"pass1","medical":"pass2"}`. Slugs are defined in `stations-config.js` (`registration`, `lev`, `medical`, `area`, `property`, `housing`, `transport`, `vet`). Volunteers open `login-station.html?st=lev` (or use the links under «כל התחנות») and do not need `HAMAL_SECRET`.
4. Deploy.

## 6. First production test
1. Open `/api/items`
2. Open `index.html`
3. Save one test record
4. Check that it appears in:
   - the table in the main page
   - dashboard
   - station pages

## Notes
- The frontend files were updated to call `/api` instead of the old Azure Functions host.
- The backend was changed from Azure Table Storage to Supabase with an upsert on `recordId`.
- `savedAt` and `updatedAt` are stored as timestamps in Supabase.
