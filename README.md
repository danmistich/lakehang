# Lake Michigan Hang — Aug 21-23

Single-page invite site with two live, shared features:

- **Availability poll** — everyone picks free time blocks across Fri/Sat/Sun, the site highlights the block with the most overlap.
- **Potluck list** — everyone adds what they're bringing to one shared, running list.

No accounts, no login. Data is stored in a public Firebase Firestore database and updates live for everyone viewing the page.

Plain HTML/CSS/JS — no build step, no npm install.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | All styling |
| `app.js` | Firebase config + all app logic |
| `firestore.rules` | Database security rules (paste into Firebase Console) |

## 1. Set up Firebase (~5 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Name it anything (e.g. `lake-hang-2026`). You can skip Google Analytics.
2. In the left sidebar, click **Build > Firestore Database > Create database**. Choose a region close to you, and start in **production mode** (we'll paste in our own rules next).
3. Click the **Rules** tab inside Firestore, delete what's there, and paste in the contents of [`firestore.rules`](firestore.rules) from this repo. Click **Publish**.
4. Back in the project overview, click the **`</>`** (web) icon to register a new web app. Give it any nickname. You don't need Firebase Hosting.
5. Firebase will show you a `firebaseConfig` object like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "lake-hang-2026.firebaseapp.com",
     projectId: "lake-hang-2026",
     storageBucket: "lake-hang-2026.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Copy it, then open [`app.js`](app.js) in this repo and replace the placeholder `firebaseConfig` object near the top of the file with your real values.

   **This config is safe to commit and expose publicly** — it's not a secret key, it just identifies which Firebase project to talk to. Access control comes from `firestore.rules`, not from hiding this object.

## 2. Deploy the site (~2 minutes)

Easiest path: **GitHub Pages**, since you're already putting this in a GitHub repo (see below).

1. Push this repo to GitHub (steps below).
2. In the repo on GitHub: **Settings > Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
4. After a minute, your site is live at `https://<your-username>.github.io/<repo-name>/`.
5. Any time someone pushes a change to `main`, the live site updates automatically within a minute or two.

Alternatives that work just as well for a static site like this: drag-and-drop the folder onto [Netlify Drop](https://app.netlify.com/drop), or `vercel deploy` via the Vercel CLI.

## 3. (Optional) Sync everything to one merged Google Sheet

By default, all data only lives in Firestore (viewable via the Firebase Console). To also get **one row per person** in a Google Sheet — merging their availability poll answer, potluck item(s), and contact info together, matched by name — no server needed:

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet (e.g. "Lake Hang Guests"). Add a header row: `Timestamp | Name | Email | Phone | Guests | Availability | Bringing`.
2. **Extensions > Apps Script**. Delete the placeholder code and paste in:
   ```js
   function doPost(e) {
     const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     const data = JSON.parse(e.postData.contents);
     const name = (data.name || "").trim();
     if (!name) return respond({ status: "error", message: "missing name" });
     const key = name.toLowerCase();

     const values = sheet.getDataRange().getValues();
     let row = -1;
     for (let i = 1; i < values.length; i++) {
       if (String(values[i][1] || "").trim().toLowerCase() === key) { row = i + 1; break; }
     }
     if (row === -1) {
       sheet.appendRow([new Date(), name, "", "", "", "", ""]);
       row = sheet.getLastRow();
     } else {
       sheet.getRange(row, 1).setValue(new Date());
     }

     // Columns: A Timestamp, B Name, C Email, D Phone, E Guests, F Availability, G Bringing
     if (data.type === "contact") {
       if (data.email) sheet.getRange(row, 3).setValue(data.email);
       if (data.phone) sheet.getRange(row, 4).setValue(data.phone);
     } else if (data.type === "rsvp") {
       sheet.getRange(row, 5).setValue(data.guests != null ? data.guests : "");
       sheet.getRange(row, 6).setValue(data.availability || "");
     } else if (data.type === "potluck") {
       const cell = sheet.getRange(row, 7);
       const existing = cell.getValue();
       cell.setValue(existing ? existing + ", " + data.item : data.item);
     }

     return respond({ status: "ok" });
   }

   function respond(obj) {
     return ContentService.createTextOutput(JSON.stringify(obj))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. **Deploy > New deployment** → gear icon next to "Select type" → **Web app**. Set **Execute as: Me**, **Who has access: Anyone**. Click **Deploy**, and authorize it (it's your own script acting on your own Sheet).
4. Copy the Web App URL (ends in `/exec`).
5. Open [`app.js`](app.js), find `GOOGLE_SHEETS_WEBAPP_URL` near the top, and replace the placeholder with that URL.

**How the merge works:** each of the three forms (poll, potluck, contact form) sends its own small payload with the person's name as the match key. The script looks for an existing row with that name (case-insensitive) and updates only the relevant columns, or creates a new row if it's their first submission. Potluck items accumulate in one cell (comma-separated) rather than overwriting, matching how potluck already works elsewhere on the site — if someone adds three items across three visits, all three show up in their row.

**Worth knowing:** the browser can't read Apps Script's response (a CORS quirk with Web Apps), so this call is "fire and forget" — the page can't tell you if it actually landed in the Sheet. That's why Firestore stays the reliable copy regardless; the Sheet is a convenience mirror. Also, since matching is by exact name text, someone submitting once as "Dan" and later as "Dan M" gets two separate rows — worth a heads-up to your group to use the same name each time. After setup, submit a test entry in each of the three sections and check the Sheet to confirm it's merging correctly.

## 4. (Optional) Host Access — see who picked what, and submitted contacts

By default the results grid only shows counts (not names) per time block, so it scales to a big group without turning into a wall of text, and contact info is entirely unreadable (write-only). "Host Access" lets specific people — you, co-hosts — sign in with Google to unlock both: names in every results-grid cell, and the list of submitted contact info in section 03.

1. Firebase Console → **Build > Authentication > Get started**. Under **Sign-in method**, enable **Google**.
2. Still in Authentication, go to **Settings > Authorized domains** and add every domain this site is deployed to (e.g. `<your-username>.github.io` and any custom/mirror domain) — `localhost` is already there by default, which is why this works when testing locally before you've added anything.
3. Open [`app.js`](app.js), find `HOST_EMAILS` near the top, and replace the placeholder with the real Google email addresses that should get host access (lowercase, one per string, comma-separated).
4. Open [`firestore.rules`](firestore.rules), find the `isHost()` function near the top, and put the **exact same list** of emails there. Paste the updated rules into Firebase Console → Firestore Database → Rules tab → **Publish** (this repo doesn't auto-deploy rules — re-paste any time `firestore.rules` changes).
5. Push. On the live site, click **Host Access** (there are two — one by the results grid, one by "Stay In The Loop," both share the same sign-in) — Google's sign-in popup appears, and if the signed-in email matches the allowlist, names appear in every grid cell and the contact list appears in section 03, for the rest of that browser session.

**Two different security levels here, worth understanding:**
- **Contact info (section 03) is genuinely locked down.** `firestore.rules`' `isHost()` check is real, server-enforced access control — before this feature, nobody (not even the site) could read `contacts` at all; now only signed-in allowlisted accounts can. There's no password anywhere in the code to find or leak.
- **The results-grid name reveal is not a full data lockdown**, even though it's the same real sign-in. `rsvps` has to stay publicly readable (`allow read: if true`) so the guest-facing headcount and overlap grid keep working with no login for anyone — so the raw name-to-block data was already technically fetchable by a determined person poking at Firestore directly, same as before this feature existed. Host Access gates the convenient on-site *view* there, not the underlying data. Fully closing that particular gap would require a real backend (a Cloud Function computing the public aggregate separately from an auth-only raw collection) — more infrastructure than it's worth; Google Sheets (step 3 above) is the better answer if you want availability data genuinely private too.

**Remember:** `HOST_EMAILS` in `app.js` and the email list in `isHost()` in `firestore.rules` are two separate lists that must be kept in sync by hand — adding or removing a host means editing both files.

## 5. Test it

Open the deployed URL (or just double-click `index.html` locally — Firestore works fine from a local file too). Submit an availability response and a potluck item, then open the site in a second browser/device and confirm you see the same data update live.

## Notes / tradeoffs

- **No auth means no gatekeeping.** Anyone with the link can add or edit entries. `firestore.rules` limits what shape of data can be written (name/item length caps, no arbitrary fields) but doesn't verify *who's* writing. Fine for a trusted friend group with a private link; don't post the link publicly.
- **Editing your own RSVP:** submitting the availability form again with the same name overwrites your previous answer (doc ID is your name, lowercased). Potluck entries are always additive — resubmitting adds a new item rather than replacing anything.
- **Removing a bad/spam entry:** go to Firebase Console > Firestore Database > Data tab, find the doc under `rsvps` or `potluck`, and delete it manually. The rules block deletes from the site itself on purpose.
