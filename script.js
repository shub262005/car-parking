/* =========================================================
   Smart Parking System – script.js
   Firebase Realtime Database integration
   Config loaded securely from /api/config (Vercel env vars)
   Layout: Section A (8 slots) | Section B (8 slots)
   ========================================================= */

// ── Configuration ──
const SECTION_A_COUNT = 8;
const SECTION_B_COUNT = 8;

// Which slots in Section A are connected to Firebase
// Map firebase path -> slot index (0-based in that section)
const FIREBASE_SLOTS_A = {
  'slot1': 0,  // Firebase "slot1" → A1
  'slot2': 1   // Firebase "slot2" → A2
};

// Which slots in Section B are connected to Firebase (none currently)
const FIREBASE_SLOTS_B = {};

// ── SVG Icons ──
function carIconSVG(color = '#94A3B8') {
  return `<svg class="slot-car-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="18" width="32" height="16" rx="4" fill="${color}" opacity="0.3"/>
    <rect x="12" y="12" width="24" height="14" rx="3" fill="${color}" opacity="0.5"/>
    <circle cx="15" cy="36" r="3" fill="${color}" opacity="0.6"/>
    <circle cx="33" cy="36" r="3" fill="${color}" opacity="0.6"/>
  </svg>`;
}

// ── Build Slot HTML ──
function createSlotHTML(label, isFirebase = false) {
  const firebaseClass = isFirebase ? ' firebase-slot' : '';
  return `
    <div class="slot${firebaseClass}" id="slot-${label}" data-slot="${label}">
      ${carIconSVG()}
      <span class="slot-number">${label}</span>
      <span class="slot-indicator"></span>
      <span class="slot-status">—</span>
    </div>
  `;
}

// ── Render Slots ──
function renderSlots() {
  const zoneA = document.getElementById('zoneA');
  const zoneB = document.getElementById('zoneB');

  // Section A: A1 to A8
  let htmlA = '';
  for (let i = 1; i <= SECTION_A_COUNT; i++) {
    const label = `A${i}`;
    const isFirebase = Object.values(FIREBASE_SLOTS_A).includes(i - 1);
    htmlA += createSlotHTML(label, isFirebase);
  }
  zoneA.innerHTML = htmlA;

  // Section B: B1 to B8
  let htmlB = '';
  for (let i = 1; i <= SECTION_B_COUNT; i++) {
    const label = `B${i}`;
    const isFirebase = Object.values(FIREBASE_SLOTS_B).includes(i - 1);
    htmlB += createSlotHTML(label, isFirebase);
  }
  zoneB.innerHTML = htmlB;

  updateMeta();
}

// ── Update Slot State ──
function setSlotState(slotLabel, state) {
  const el = document.getElementById(`slot-${slotLabel}`);
  if (!el) return;

  el.classList.remove('available', 'occupied');

  if (state === 'available') {
    el.classList.add('available');
    el.querySelector('.slot-status').textContent = 'Empty';
  } else if (state === 'occupied') {
    el.classList.add('occupied');
    el.querySelector('.slot-status').textContent = 'Occupied';
  } else {
    el.querySelector('.slot-status').textContent = '—';
  }
}

// ── Update Meta Counters ──
function updateMeta() {
  const zoneA = document.getElementById('zoneA');
  const zoneB = document.getElementById('zoneB');

  const totalA = zoneA.querySelectorAll('.slot').length;
  const availA = zoneA.querySelectorAll('.slot.available').length;

  const totalB = zoneB.querySelectorAll('.slot').length;
  const availB = zoneB.querySelectorAll('.slot.available').length;

  document.getElementById('zoneAMeta').textContent = `${availA} / ${totalA} Available`;
  document.getElementById('zoneBMeta').textContent = `${availB} / ${totalB} Available`;
}

// ── Firebase Listeners ──
function setupFirebaseListeners(db) {
  Object.entries(FIREBASE_SLOTS_A).forEach(([fbPath, slotIndex]) => {
    const slotLabel = `A${slotIndex + 1}`;
    db.ref(`parking/${fbPath}`).on('value', (snapshot) => {
      const val = snapshot.val();
      if (val === 'occupied' || val === 1 || val === '1' || val === true) {
        setSlotState(slotLabel, 'occupied');
      } else if (val === 'empty' || val === 0 || val === '0' || val === false) {
        setSlotState(slotLabel, 'available');
      } else {
        setSlotState(slotLabel, 'default');
      }
      updateMeta();
    });
  });

  Object.entries(FIREBASE_SLOTS_B).forEach(([fbPath, slotIndex]) => {
    const slotLabel = `B${slotIndex + 1}`;
    db.ref(`parking/${fbPath}`).on('value', (snapshot) => {
      const val = snapshot.val();
      if (val === 'occupied' || val === 1 || val === '1' || val === true) {
        setSlotState(slotLabel, 'occupied');
      } else if (val === 'empty' || val === 0 || val === '0' || val === false) {
        setSlotState(slotLabel, 'available');
      } else {
        setSlotState(slotLabel, 'default');
      }
      updateMeta();
    });
  });
}

// ── Footer Timestamp ──
function updateFooterTime() {
  const el = document.getElementById('footerTime');
  if (el) el.textContent = 'Last refreshed: ' + new Date().toLocaleString();
}

// ── Bootstrap: fetch config from /api/config, then init Firebase ──
async function bootstrap() {
  renderSlots();
  updateFooterTime();
  setInterval(updateFooterTime, 30000);

  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    const firebaseConfig = await res.json();

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    setupFirebaseListeners(db);
  } catch (err) {
    console.error('Firebase init failed:', err);
    // Show a non-blocking error in the footer
    const el = document.getElementById('footerTime');
    if (el) el.textContent = '⚠️ Could not connect to Firebase. Check your environment variables.';
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
