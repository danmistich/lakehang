// ---------------------------------------------------------------------------
// 1. FIREBASE CONFIG — from Firebase Console > Project Settings > Your apps.
//    Safe to commit/expose publicly — not a secret key. Access is controlled
//    by firestore.rules, not by hiding this object.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCyIWn4R3_0RkrK9mtckzMqfjo6dJyriEM",
  authDomain: "lakehang.firebaseapp.com",
  projectId: "lakehang",
  storageBucket: "lakehang.firebasestorage.app",
  messagingSenderId: "251020745131",
  appId: "1:251020745131:web:3a723c88e39cef4f661aee"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, addDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------------------------------------------------------
// HOST ACCESS — see who picked what time slot, gated to specific Google
// accounts. Requires enabling Google sign-in in Firebase Console >
// Authentication, and adding this domain to Authorized domains there
// (see README "Host Access" section). Add real host emails below, lowercase.
//
// Worth knowing: `rsvps` stays publicly readable (needed for the guest-
// facing headcount/overlap grid to work with no login), so this is a real
// sign-in requirement — no password sits in this file to find or leak — but
// it gates the on-site *view*, not the underlying Firestore data itself.
// ---------------------------------------------------------------------------
const HOST_EMAILS = [
  "dan.mistich@gmail.com",
  "rubytahuti@gmail.com",
  "michaelrappa@gmail.com",
  "zkeesh@gmail.com"
];

// ---------------------------------------------------------------------------
// GOOGLE SHEETS SYNC — Apps Script Web App URL (see README "Sync to a Google
// Sheet" section for setup). Best-effort mirror of all three forms (poll,
// potluck, contact) into ONE merged row per person, matched by name.
// Firestore stays the reliable source of truth regardless.
// ---------------------------------------------------------------------------
const GOOGLE_SHEETS_WEBAPP_URL = "REPLACE_WITH_GOOGLE_SHEETS_WEBAPP_URL";

function syncToSheet(payload) {
  if (GOOGLE_SHEETS_WEBAPP_URL.startsWith("REPLACE_WITH")) return;
  // no-cors: Apps Script Web Apps don't send CORS headers the browser can
  // read, so this is fire-and-forget — we can't confirm it landed. That's
  // fine since Firestore (written just before this call) is the reliable copy.
  fetch(GOOGLE_SHEETS_WEBAPP_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).catch(e => console.error("Sheet sync failed (non-blocking):", e));
}

// ---------------------------------------------------------------------------
// 2. AVAILABILITY POLL
// ---------------------------------------------------------------------------
const DAYS = [
  { key: "fri", label: "Fri", date: "Aug 21" },
  { key: "sat", label: "Sat", date: "Aug 22" },
  { key: "sun", label: "Sun", date: "Aug 23" }
];
const TIMES = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" }
];
const BLOCK_KEYS = DAYS.flatMap(d => TIMES.map(t => `${d.key}_${t.key}`));

let isHost = false;
let lastResponses = [];

function blockLabel(key) {
  const [dayKey, timeKey] = key.split("_");
  const day = DAYS.find(d => d.key === dayKey);
  const time = TIMES.find(t => t.key === timeKey);
  return `${day.label} ${time.label}`;
}

const inputGrid = document.getElementById("input-grid");
const resultsGrid = document.getElementById("results-grid");
const pollNameInput = document.getElementById("poll-name");
const pollGuestsInput = document.getElementById("poll-guests");
const pollStatus = document.getElementById("poll-status");
const responderCount = document.getElementById("responder-count");
const headcountNumber = document.getElementById("headcount-number");
const whoComing = document.getElementById("who-coming");

let selectedBlocks = new Set();

function buildHeaderRow(container) {
  const corner = document.createElement("div");
  container.appendChild(corner);
  DAYS.forEach(d => {
    const head = document.createElement("div");
    head.className = "head";
    head.innerHTML = `<span class="head-day">${d.label}</span><span class="head-date">${d.date}</span>`;
    container.appendChild(head);
  });
}

function buildInputGrid() {
  inputGrid.innerHTML = "";
  buildHeaderRow(inputGrid);
  TIMES.forEach(t => {
    const rowLabel = document.createElement("div");
    rowLabel.className = "row-label";
    rowLabel.textContent = t.label;
    inputGrid.appendChild(rowLabel);
    DAYS.forEach(d => {
      const key = `${d.key}_${t.key}`;
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = `${d.label} ${t.label}`;
      cell.dataset.key = key;
      cell.addEventListener("click", () => {
        if (selectedBlocks.has(key)) {
          selectedBlocks.delete(key);
          cell.classList.remove("selected");
        } else {
          selectedBlocks.add(key);
          cell.classList.add("selected");
        }
      });
      inputGrid.appendChild(cell);
    });
  });
}

function buildResultsGridSkeleton() {
  resultsGrid.innerHTML = "";
  buildHeaderRow(resultsGrid);
  TIMES.forEach(t => {
    const rowLabel = document.createElement("div");
    rowLabel.className = "row-label";
    rowLabel.textContent = t.label;
    resultsGrid.appendChild(rowLabel);
    DAYS.forEach(d => {
      const key = `${d.key}_${t.key}`;
      const cell = document.createElement("div");
      cell.className = "cell result none";
      cell.dataset.key = key;
      cell.innerHTML = `<span class="count">0</span>`;
      resultsGrid.appendChild(cell);
    });
  });
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function renderResults(responses) {
  lastResponses = responses;

  const counts = {};
  const names = {};
  BLOCK_KEYS.forEach(k => { counts[k] = 0; names[k] = []; });

  responses.forEach(r => {
    const blocks = r.blocks || {};
    BLOCK_KEYS.forEach(k => {
      if (blocks[k]) {
        counts[k]++;
        names[k].push(r.name);
      }
    });
  });

  const maxCount = Math.max(0, ...Object.values(counts));

  BLOCK_KEYS.forEach(key => {
    const cell = resultsGrid.querySelector(`.cell[data-key="${key}"]`);
    if (!cell) return;
    const n = counts[key];
    cell.querySelector(".count").textContent = n;
    cell.classList.remove("none", "some", "best");
    if (n === 0) {
      cell.classList.add("none");
    } else if (maxCount > 0 && n === maxCount) {
      cell.classList.add("best");
    } else {
      cell.classList.add("some");
    }

    let whoSpan = cell.querySelector(".who");
    if (isHost) {
      if (!whoSpan) {
        whoSpan = document.createElement("span");
        whoSpan.className = "who";
        cell.appendChild(whoSpan);
      }
      whoSpan.textContent = names[key].join(", ");
    } else if (whoSpan) {
      whoSpan.remove();
    }
  });

  if (responses.length === 0) {
    responderCount.textContent = "No responses yet — be the first!";
  } else {
    responderCount.textContent = `${responses.length} ${responses.length === 1 ? "person has" : "people have"} responded. Best overlap highlighted below.`;
  }

  const totalHeadcount = responses.reduce((sum, r) => sum + 1 + (Number(r.guests) || 0), 0);
  headcountNumber.textContent = totalHeadcount;

  whoComing.textContent = responses.length === 0
    ? ""
    : `Coming so far: ${responses.map(r => r.name).join(", ")}`;
}

buildInputGrid();
buildResultsGridSkeleton();

const rsvpsQuery = query(collection(db, "rsvps"), orderBy("updatedAt", "asc"));
onSnapshot(rsvpsQuery, snapshot => {
  const responses = snapshot.docs.map(d => d.data());
  renderResults(responses);
}, err => {
  console.error("Failed to load availability:", err);
  responderCount.textContent = "Couldn't load responses — check your Firebase setup.";
});

document.getElementById("submit-availability").addEventListener("click", async () => {
  const rawName = pollNameInput.value;
  const name = rawName.trim();
  if (!name) {
    setStatus(pollStatus, "Add your name first!", "err");
    return;
  }
  if (selectedBlocks.size === 0) {
    setStatus(pollStatus, "Pick at least one time block.", "err");
    return;
  }

  const blocks = {};
  BLOCK_KEYS.forEach(k => { blocks[k] = selectedBlocks.has(k); });

  let guests = parseInt(pollGuestsInput.value, 10);
  if (!Number.isFinite(guests) || guests < 0) guests = 0;
  if (guests > 20) guests = 20;

  const btn = document.getElementById("submit-availability");
  btn.disabled = true;
  try {
    const docId = normalizeName(name);
    await setDoc(doc(db, "rsvps", docId), {
      name,
      blocks,
      guests,
      updatedAt: serverTimestamp()
    });
    syncToSheet({
      type: "rsvp",
      name,
      guests,
      availability: [...selectedBlocks].map(blockLabel).join(", ")
    });
    setStatus(pollStatus, "Got it — thanks! You can update anytime by resubmitting.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(pollStatus, "Something went wrong saving that. Try again.", "err");
  } finally {
    btn.disabled = false;
  }
});

function setStatus(el, msg, kind) {
  el.textContent = msg;
  el.className = "status-msg " + kind;
}

// ---------------------------------------------------------------------------
// 3. POTLUCK LIST
// ---------------------------------------------------------------------------
const potluckNameInput = document.getElementById("potluck-name");
const potluckItemInput = document.getElementById("potluck-item");
const potluckStatus = document.getElementById("potluck-status");
const potluckList = document.getElementById("potluck-list");
const potluckEmpty = document.getElementById("potluck-empty");
const dupeWarning = document.getElementById("dupe-warning");

let currentItems = [];

const potluckQuery = query(collection(db, "potluck"), orderBy("createdAt", "asc"));
onSnapshot(potluckQuery, snapshot => {
  currentItems = snapshot.docs.map(d => d.data());
  renderPotluck(currentItems);
}, err => {
  console.error("Failed to load potluck list:", err);
  potluckEmpty.textContent = "Couldn't load the list — check your Firebase setup.";
  potluckEmpty.style.display = "block";
});

function renderPotluck(items) {
  potluckList.innerHTML = "";
  potluckEmpty.style.display = items.length === 0 ? "block" : "none";
  items.forEach(entry => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="potluck-item">${escapeHtml(entry.item)}</span><span class="potluck-by">${escapeHtml(entry.name)}</span>`;
    potluckList.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

potluckItemInput.addEventListener("input", () => {
  const val = potluckItemInput.value.trim().toLowerCase();
  if (val.length < 3) {
    dupeWarning.classList.remove("show");
    return;
  }
  const match = currentItems.find(entry =>
    entry.item.toLowerCase().includes(val) || val.includes(entry.item.toLowerCase())
  );
  if (match) {
    dupeWarning.textContent = `Heads up — ${match.name} is already bringing "${match.item}". Maybe bring something else!`;
    dupeWarning.classList.add("show");
  } else {
    dupeWarning.classList.remove("show");
  }
});

document.getElementById("submit-potluck").addEventListener("click", async () => {
  const name = potluckNameInput.value.trim();
  const item = potluckItemInput.value.trim();
  if (!name || !item) {
    setStatus(potluckStatus, "Fill in both your name and what you're bringing.", "err");
    return;
  }

  const btn = document.getElementById("submit-potluck");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "potluck"), {
      name,
      item,
      createdAt: serverTimestamp()
    });
    syncToSheet({ type: "potluck", name, item });
    potluckItemInput.value = "";
    dupeWarning.classList.remove("show");
    setStatus(potluckStatus, "Added! Thanks for bringing that.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(potluckStatus, "Something went wrong saving that. Try again.", "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// 4. CONTACT INFO (write-only — never read back on the site). Saved to
//    Firestore as the reliable copy, and best-effort mirrored into a
//    Google Sheet for easy access when it's time to send a heads-up.
// ---------------------------------------------------------------------------
const contactNameInput = document.getElementById("contact-name");
const contactEmailInput = document.getElementById("contact-email");
const contactPhoneInput = document.getElementById("contact-phone");
const contactStatus = document.getElementById("contact-status");

document.getElementById("submit-contact").addEventListener("click", async () => {
  const name = contactNameInput.value.trim();
  const email = contactEmailInput.value.trim();
  const phone = contactPhoneInput.value.trim();

  if (!name) {
    setStatus(contactStatus, "Add your name first!", "err");
    return;
  }
  if (!email && !phone) {
    setStatus(contactStatus, "Add an email or phone number.", "err");
    return;
  }

  const btn = document.getElementById("submit-contact");
  btn.disabled = true;
  try {
    await addDoc(collection(db, "contacts"), {
      name,
      email,
      phone,
      createdAt: serverTimestamp()
    });
    syncToSheet({ type: "contact", name, email, phone });
    contactEmailInput.value = "";
    contactPhoneInput.value = "";
    setStatus(contactStatus, "Got it — thanks!", "ok");
  } catch (e) {
    console.error(e);
    setStatus(contactStatus, "Something went wrong saving that. Try again.", "err");
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// 5. HOST ACCESS
// ---------------------------------------------------------------------------
const hostAccessBtn = document.getElementById("host-access-btn");
const hostAccessStatus = document.getElementById("host-access-status");
const googleProvider = new GoogleAuthProvider();

hostAccessBtn.addEventListener("click", async () => {
  if (auth.currentUser) {
    await signOut(auth);
    return;
  }
  hostAccessBtn.disabled = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.error(e);
    hostAccessStatus.textContent = "Sign-in didn't go through — try again.";
  } finally {
    hostAccessBtn.disabled = false;
  }
});

onAuthStateChanged(auth, async user => {
  const recognized = !!user && HOST_EMAILS.includes((user.email || "").toLowerCase());

  if (user && !recognized) {
    hostAccessStatus.textContent = "That Google account isn't a recognized host.";
    await signOut(auth);
    return; // signOut re-triggers this handler with user = null
  }

  isHost = recognized;
  hostAccessBtn.textContent = recognized ? "Sign out" : "Host Access";
  hostAccessStatus.textContent = recognized ? `Signed in as ${user.email} — names shown below.` : "";
  resultsGrid.classList.toggle("host-mode", recognized);
  renderResults(lastResponses);
});
