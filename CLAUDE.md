# Lake Hang site

Single-page invite site for a Lake Michigan hangout (Aug 21-23). Plain HTML/CSS/JS, no build step, no npm install — just open `index.html` or deploy the folder as-is.

## Structure

- `index.html` — page structure (hero, availability poll section, potluck section)
- `style.css` — all styling, lake/sunset theme
- `app.js` — Firebase config (top of file) + all logic for both features
- `firestore.rules` — Firestore security rules; paste into Firebase Console > Firestore > Rules whenever they change

## Data model (Firestore)

- `rsvps/{normalizedName}` — one doc per person. `{ name, blocks: { fri_morning: bool, fri_afternoon: bool, ..., sun_evening: bool }, guests: int (0-20, extra people they're bringing, not counting themselves), updatedAt }`. Doc ID is the person's name, lowercased/trimmed, so resubmitting updates in place. Total headcount displayed on the site = number of rsvp docs + sum of `guests`.
- `potluck/{autoId}` — one doc per item added. `{ name, item, createdAt }`. Always additive, never overwritten.
- `contacts/{autoId}` — one doc per submission from "Stay In The Loop". `{ name, email, phone, createdAt }`. Write-only rules (no read/update/delete from the client) — hosts pull entries from the Firebase Console.

## Google Sheets sync

All three forms (poll, potluck, contact) call the shared `syncToSheet(payload)` helper in `app.js` after their Firestore write succeeds, each sending `{ type: "rsvp"|"potluck"|"contact", name, ...fields }` to the Apps Script Web App at `GOOGLE_SHEETS_WEBAPP_URL`. The script (see README step 3) upserts by name (case-insensitive) into **one merged row per person** — poll/contact fields overwrite their columns, potluck items accumulate comma-separated in one cell. This is a no-op until `GOOGLE_SHEETS_WEBAPP_URL` is set to a real deployment (guarded by a `REPLACE_WITH` prefix check). The call uses `mode: "no-cors"` so the page can never confirm success/failure — Firestore is the reliable copy, the Sheet is a best-effort mirror. If you add a fourth form or new fields, follow the same pattern: write to Firestore first, then call `syncToSheet` with a `type` and the person's `name`, and extend the Apps Script's column mapping to match.

Time block keys are `${day}_${time}` where day is `fri`/`sat`/`sun` and time is `morning`/`afternoon`/`evening`. Defined in `app.js` as `DAYS` and `TIMES`.

## Working on this

- No auth on the site by design — it's an ungated invite link for a private friend group. Don't add a login.
- No package.json / build tooling on purpose — keep it plain HTML/CSS/JS so it stays trivial to deploy (GitHub Pages / Netlify / Vercel, all zero-config for a static folder).
- If you touch `firestore.rules`, remind whoever's testing to also re-paste the updated rules into the Firebase Console — this repo doesn't auto-deploy rules.
- The live Firebase project config lives in `app.js` (top of file) — it's intentionally public/non-secret, safe to commit.
- See `README.md` for full setup/deploy steps.
