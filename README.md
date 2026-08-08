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

## 3. Fill in the remaining placeholders

Three small placeholders in [`index.html`](index.html) need real values (search for `REPLACE_WITH` / `YOUR_SPOTIFY_PLAYLIST_ID`):

1. **Spotify playlist embed** — create a real playlist in Spotify, make it collaborative (playlist menu → "Make collaborative") so guests can add songs from the Spotify app directly, then get its share link (Share → Copy link to playlist). It looks like `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`. The part after `/playlist/` and before any `?` is the playlist ID — paste it into the `iframe src` in `index.html`, replacing `YOUR_SPOTIFY_PLAYLIST_ID`.
2. **Team Human Patreon link** — replace `REPLACE_WITH_TEAM_HUMAN_PATREON_URL` with the real Patreon URL.
3. **Groucho link** — replace `REPLACE_WITH_GROUCHO_URL` with Groucho's real site/app URL.

## 4. Test it

Open the deployed URL (or just double-click `index.html` locally — Firestore works fine from a local file too). Submit an availability response and a potluck item, then open the site in a second browser/device and confirm you see the same data update live.

## Notes / tradeoffs

- **No auth means no gatekeeping.** Anyone with the link can add or edit entries. `firestore.rules` limits what shape of data can be written (name/item length caps, no arbitrary fields) but doesn't verify *who's* writing. Fine for a trusted friend group with a private link; don't post the link publicly.
- **Editing your own RSVP:** submitting the availability form again with the same name overwrites your previous answer (doc ID is your name, lowercased). Potluck entries are always additive — resubmitting adds a new item rather than replacing anything.
- **Removing a bad/spam entry:** go to Firebase Console > Firestore Database > Data tab, find the doc under `rsvps` or `potluck`, and delete it manually. The rules block deletes from the site itself on purpose.
