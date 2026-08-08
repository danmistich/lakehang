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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
      cell.innerHTML = `<span class="count">0</span><span class="who"></span>`;
      resultsGrid.appendChild(cell);
    });
  });
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function renderResults(responses) {
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
    cell.querySelector(".who").textContent = names[key].join(", ");
    cell.classList.remove("none", "some", "best");
    if (n === 0) {
      cell.classList.add("none");
    } else if (maxCount > 0 && n === maxCount) {
      cell.classList.add("best");
    } else {
      cell.classList.add("some");
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
// 4. CONTACT INFO (write-only — never read back on the site, hosts pull it
//    from the Firebase Console when it's time to send a heads-up)
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
