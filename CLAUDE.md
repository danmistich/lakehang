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
- `contacts/{autoId}` — one doc per submission from "Stay In The Loop". `{ name, email, phone, createdAt }`. Create is open to anyone (guest submissions); read is host-only via `isHost()` in `firestore.rules` — see Host Access below. Signed-in hosts see this list rendered live in section 03; without Host Access, pull entries from the Firebase Console instead.

## Google Sheets sync

All three forms (poll, potluck, contact) call the shared `syncToSheet(payload)` helper in `app.js` after their Firestore write succeeds, each sending `{ type: "rsvp"|"potluck"|"contact", name, ...fields }` to the Apps Script Web App at `GOOGLE_SHEETS_WEBAPP_URL`. The script (see README step 3) upserts by name (case-insensitive) into **one merged row per person** — poll/contact fields overwrite their columns, potluck items accumulate comma-separated in one cell. This is a no-op until `GOOGLE_SHEETS_WEBAPP_URL` is set to a real deployment (guarded by a `REPLACE_WITH` prefix check). The call uses `mode: "no-cors"` so the page can never confirm success/failure — Firestore is the reliable copy, the Sheet is a best-effort mirror. If you add a fourth form or new fields, follow the same pattern: write to Firestore first, then call `syncToSheet` with a `type` and the person's `name`, and extend the Apps Script's column mapping to match.

Time block keys are `${day}_${time}` where day is `fri`/`sat`/`sun` and time is `morning`/`afternoon`/`evening`. Defined in `app.js` as `DAYS` and `TIMES`.

## Host Access

Firebase Auth (Google sign-in), gated by two allowlists that must be kept in sync by hand:
- `HOST_EMAILS` in `app.js` — drives the on-site UI (results-grid name reveal, contacts list visibility).
- `isHost()` in `firestore.rules` — the actual server-side read gate on `contacts`.

There are **two** `.host-access-btn` / `.host-access-status` instances in `index.html` (one near the results grid, one in the contact section) sharing one `onAuthStateChanged` handler in `app.js` — selected via `querySelectorAll`, not `getElementById`, so adding a third instance anywhere just needs the same two classes, no JS changes. Signing in as an allowlisted email: (1) reveals per-person names in every results-grid cell (the `.who` span), and (2) subscribes to `contacts` and renders submissions into `#host-contacts` (reuses `.potluck-list` styling). Both reset on sign-out; the contacts `onSnapshot` listener is explicitly unsubscribed then (stored in `unsubscribeContacts`) so a signed-out session doesn't keep pulling host-only data.

Requires enabling Google sign-in + adding every deployed domain to Firebase Console > Authentication > Authorized domains (see README step 4) — until then `signInWithPopup` will error, which the UI handles gracefully (status text, button re-enables).

Important nuance if you touch this — **the two things Host Access unlocks have different real security levels**:
- **Contacts (section 03) is a real lockdown.** Before this existed, `contacts` was `allow read: if false` for everyone, no exceptions. `isHost()` is a strict upgrade enforced server-side — there's nothing to bypass client-side.
- **The results-grid name reveal is not a data lockdown**, even though it's the same sign-in. `rsvps` stays `allow read: if true` in `firestore.rules` because the guest-facing headcount/overlap grid needs it, so the name-to-block linkage was already technically public before this feature existed. Don't describe this half as "securing" the RSVP data in user-facing copy; it gates the on-site convenience view, not the underlying Firestore access.

`renderResults()` reruns on every auth state change (via cached `lastResponses`) so the grid updates immediately on sign-in/out without a new Firestore read.

## Working on this

- No auth for guests, by design — RSVP/potluck/contact stay an ungated, no-login flow for a private friend group. Don't add a login requirement to any of those three forms. (Host Access, above, is a narrow, opt-in exception for a reporting feature only.)
- No package.json / build tooling on purpose — keep it plain HTML/CSS/JS so it stays trivial to deploy (GitHub Pages / Netlify / Vercel, all zero-config for a static folder).
- If you touch `firestore.rules`, remind whoever's testing to also re-paste the updated rules into the Firebase Console — this repo doesn't auto-deploy rules.
- The live Firebase project config lives in `app.js` (top of file) — it's intentionally public/non-secret, safe to commit.
- The site deploys to both GitHub Pages (`danmistich.github.io/lakehang`) and Netlify (`chicagogroucholakehang.netlify.app`, the canonical public-facing domain). Every shipped change must actually land on both — `git push` from this environment fails (no cached credentials), so pushes go through GitHub Desktop. Always `git fetch origin` and diff `origin/main..HEAD` after committing to confirm nothing is sitting unpushed before calling a fix "live."
- See `README.md` for full setup/deploy steps.
